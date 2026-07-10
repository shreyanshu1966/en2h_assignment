import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking } from './entities/booking.entity';
import { Service } from '../services/entities/service.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { CreateBookingDto } from './dto/create-booking.dto';

type MockRepo<T extends object = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createMockRepo = <T extends object = any>(): MockRepo<T> => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const tomorrow = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};

const yesterday = (): string => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
};

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingsRepo: MockRepo<Booking>;
  let servicesRepo: MockRepo<Service>;

  const activeService: Service = {
    id: 'service-1',
    title: 'Haircut',
    description: 'A basic haircut',
    duration: 30,
    price: '25.00',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseDto: CreateBookingDto = {
    customerName: 'John Smith',
    customerEmail: 'john@example.com',
    customerPhone: '+1-555-000-0000',
    serviceId: 'service-1',
    bookingDate: tomorrow(),
    bookingTime: '10:00',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: createMockRepo<Booking>(),
        },
        {
          provide: getRepositoryToken(Service),
          useValue: createMockRepo<Service>(),
        },
      ],
    }).compile();

    service = module.get(BookingsService);
    bookingsRepo = module.get(getRepositoryToken(Booking));
    servicesRepo = module.get(getRepositoryToken(Service));
  });

  describe('create', () => {
    it('creates a booking when the service exists, is active, and the slot is free', async () => {
      servicesRepo.findOne!.mockResolvedValue(activeService);
      bookingsRepo.findOne!.mockResolvedValue(null);
      bookingsRepo.create!.mockImplementation((data: object) => data);
      bookingsRepo.save!.mockImplementation((data: object) =>
        Promise.resolve({ id: 'booking-1', ...data }),
      );

      const result = await service.create(baseDto);

      expect(result.status).toBe(BookingStatus.PENDING);
      expect(bookingsRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when the service does not exist', async () => {
      servicesRepo.findOne!.mockResolvedValue(null);

      await expect(service.create(baseDto)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the service is inactive', async () => {
      servicesRepo.findOne!.mockResolvedValue({
        ...activeService,
        isActive: false,
      });

      await expect(service.create(baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when bookingDate is in the past', async () => {
      servicesRepo.findOne!.mockResolvedValue(activeService);

      await expect(
        service.create({ ...baseDto, bookingDate: yesterday() }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when the slot is already booked', async () => {
      servicesRepo.findOne!.mockResolvedValue(activeService);
      bookingsRepo.findOne!.mockResolvedValue({ id: 'existing-booking' });

      await expect(service.create(baseDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateStatus', () => {
    const bookingWithStatus = (status: BookingStatus) => ({
      id: 'booking-1',
      status,
    });

    it('allows PENDING -> CONFIRMED', async () => {
      bookingsRepo.findOne!.mockResolvedValue(
        bookingWithStatus(BookingStatus.PENDING),
      );
      bookingsRepo.save!.mockImplementation((b) => Promise.resolve(b));

      const result = await service.updateStatus(
        'booking-1',
        BookingStatus.CONFIRMED,
      );
      expect(result.status).toBe(BookingStatus.CONFIRMED);
    });

    it('allows CONFIRMED -> COMPLETED', async () => {
      bookingsRepo.findOne!.mockResolvedValue(
        bookingWithStatus(BookingStatus.CONFIRMED),
      );
      bookingsRepo.save!.mockImplementation((b) => Promise.resolve(b));

      const result = await service.updateStatus(
        'booking-1',
        BookingStatus.COMPLETED,
      );
      expect(result.status).toBe(BookingStatus.COMPLETED);
    });

    it('rejects CANCELLED -> COMPLETED', async () => {
      bookingsRepo.findOne!.mockResolvedValue(
        bookingWithStatus(BookingStatus.CANCELLED),
      );

      await expect(
        service.updateStatus('booking-1', BookingStatus.COMPLETED),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects PENDING -> COMPLETED (must go through CONFIRMED)', async () => {
      bookingsRepo.findOne!.mockResolvedValue(
        bookingWithStatus(BookingStatus.PENDING),
      );

      await expect(
        service.updateStatus('booking-1', BookingStatus.COMPLETED),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects any transition out of COMPLETED', async () => {
      bookingsRepo.findOne!.mockResolvedValue(
        bookingWithStatus(BookingStatus.COMPLETED),
      );

      await expect(
        service.updateStatus('booking-1', BookingStatus.CANCELLED),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for an unknown booking id', async () => {
      bookingsRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.updateStatus('missing-id', BookingStatus.CONFIRMED),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('cancels a PENDING booking', async () => {
      bookingsRepo.findOne!.mockResolvedValue({
        id: 'booking-1',
        status: BookingStatus.PENDING,
      });
      bookingsRepo.save!.mockImplementation((b) => Promise.resolve(b));

      const result = await service.cancel('booking-1');
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('throws BadRequestException when cancelling an already COMPLETED booking', async () => {
      bookingsRepo.findOne!.mockResolvedValue({
        id: 'booking-1',
        status: BookingStatus.COMPLETED,
      });

      await expect(service.cancel('booking-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
