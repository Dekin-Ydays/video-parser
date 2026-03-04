import { IsString, IsOptional, IsObject } from 'class-validator';

export class CompareVideosDto {
  @IsString()
  referenceVideoId: string;

  @IsString()
  comparisonVideoId: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
