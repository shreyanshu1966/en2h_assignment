import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { QueryServicesDto } from './dto/query-services.dto';

@ApiTags('services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a service' })
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List services (paginated, filterable by isActive)',
  })
  findAll(@Query() query: QueryServicesDto) {
    return this.servicesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a service by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a service' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a service' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.remove(id);
  }
}
