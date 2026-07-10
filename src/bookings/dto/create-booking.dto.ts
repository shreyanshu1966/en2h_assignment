import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsNotPastDate } from '../../common/validators/is-not-past-date.validator';

export class CreateBookingDto {
  @ApiProperty({ example: 'John Smith' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  customerName: string;

  @ApiProperty({ example: 'john.smith@example.com' })
  @IsEmail()
  customerEmail: string;

  @ApiProperty({ example: '+1-555-123-4567' })
  @IsString()
  @Matches(/^[0-9+\-() ]{7,20}$/, {
    message: 'customerPhone must be a valid phone number',
  })
  customerPhone: string;

  @ApiProperty({ description: 'Id of the service being booked' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({ example: '2026-08-01', description: 'Format: YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'bookingDate must be in format YYYY-MM-DD',
  })
  @IsNotPastDate()
  bookingDate: string;

  @ApiProperty({ example: '14:30', description: 'Format: HH:mm (24h)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'bookingTime must be in format HH:mm',
  })
  bookingTime: string;

  @ApiPropertyOptional({ example: 'Please use the back entrance' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
