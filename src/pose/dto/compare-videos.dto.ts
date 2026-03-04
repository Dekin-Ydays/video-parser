import { IsString, IsOptional, IsObject } from 'class-validator';
import { ComparatorConfig } from '../comparator';

export class CompareVideosDto {
  @IsString()
  referenceVideoId: string;

  @IsString()
  comparisonVideoId: string;

  @IsOptional()
  @IsObject()
  config?: ComparatorConfig;
}
