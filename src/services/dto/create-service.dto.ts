import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Deep Tissue Massage' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: '60-minute full body deep tissue massage' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Duration in minutes', example: 60 })
  @IsInt()
  @Min(1)
  duration: number;

  @ApiProperty({ example: 49.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
