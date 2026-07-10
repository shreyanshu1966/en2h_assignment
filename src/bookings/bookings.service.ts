import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { Service } from '../services/entities/service.entity';
import { Booking } from './entities/booking.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';

const ALLOWED_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.COMPLETED]: [],
};

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(Service)
    private readonly servicesRepository: Repository<Service>,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    const service = await this.servicesRepository.findOne({
      where: { id: dto.serviceId },
    });
    if (!service) {
      throw new NotFoundException(`Service with id ${dto.serviceId} not found`);
    }
    if (!service.isActive) {
      throw new BadRequestException('Cannot book an inactive service');
    }

    this.assertNotPastDate(dto.bookingDate);

    const duplicate = await this.bookingsRepository.findOne({
      where: {
        serviceId: dto.serviceId,
        bookingDate: dto.bookingDate,
        bookingTime: dto.bookingTime,
        status: Not(BookingStatus.CANCELLED),
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'This service is already booked for the selected date and time',
      );
    }

    const booking = this.bookingsRepository.create({
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      serviceId: dto.serviceId,
      bookingDate: dto.bookingDate,
      bookingTime: dto.bookingTime,
      notes: dto.notes ?? null,
      status: BookingStatus.PENDING,
    });
    return this.bookingsRepository.save(booking);
  }

  async findAll(query: QueryBookingsDto): Promise<PaginatedResult<Booking>> {
    const { page, limit, status, search } = query;
    const qb = this.bookingsRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.service', 'service');

    if (status) {
      qb.andWhere('booking.status = :status', { status });
    }
    if (search) {
      qb.andWhere(
        '(booking.customerName ILIKE :search OR booking.customerEmail ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('booking.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Booking> {
    const booking = await this.bookingsRepository.findOne({ where: { id } });
    if (!booking) {
      throw new NotFoundException(`Booking with id ${id} not found`);
    }
    return booking;
  }

  async updateStatus(id: string, status: BookingStatus): Promise<Booking> {
    const booking = await this.findOne(id);
    this.assertValidTransition(booking.status, status);
    booking.status = status;
    return this.bookingsRepository.save(booking);
  }

  async cancel(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    this.assertValidTransition(booking.status, BookingStatus.CANCELLED);
    booking.status = BookingStatus.CANCELLED;
    return this.bookingsRepository.save(booking);
  }

  private assertNotPastDate(bookingDate: string): void {
    const inputDate = new Date(`${bookingDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (inputDate.getTime() < today.getTime()) {
      throw new BadRequestException('bookingDate cannot be in the past');
    }
  }

  private assertValidTransition(from: BookingStatus, to: BookingStatus): void {
    if (from === to) return;
    const allowed = ALLOWED_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Cannot change booking status from ${from} to ${to}`,
      );
    }
  }
}
