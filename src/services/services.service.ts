import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { QueryServicesDto } from './dto/query-services.dto';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly servicesRepository: Repository<Service>,
  ) {}

  create(dto: CreateServiceDto): Promise<Service> {
    const service = this.servicesRepository.create({
      ...dto,
      price: dto.price.toFixed(2),
    });
    return this.servicesRepository.save(service);
  }

  async findAll(query: QueryServicesDto): Promise<PaginatedResult<Service>> {
    const { page, limit, isActive } = query;
    const where: FindOptionsWhere<Service> = {};
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await this.servicesRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.servicesRepository.findOne({ where: { id } });
    if (!service) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }
    return service;
  }

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.findOne(id);
    Object.assign(service, {
      ...dto,
      price: dto.price !== undefined ? dto.price.toFixed(2) : service.price,
    });
    return this.servicesRepository.save(service);
  }

  async remove(id: string): Promise<{ message: string }> {
    const service = await this.findOne(id);
    await this.servicesRepository.remove(service);
    return { message: 'Service deleted successfully' };
  }
}
