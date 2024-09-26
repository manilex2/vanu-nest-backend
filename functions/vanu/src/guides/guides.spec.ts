import { Guides } from './guides';
import { ConfigService } from '@nestjs/config';

describe('Guides', () => {
  let configService: ConfigService;
  it('should be defined', () => {
    expect(new Guides(configService)).toBeDefined();
  });
});
