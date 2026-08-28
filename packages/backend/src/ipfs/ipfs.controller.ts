import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IpfsService } from './ipfs.service';

@Controller('ipfs')
export class IpfsController {
  constructor(private readonly ipfsService: IpfsService) {}

  /**
   * POST /ipfs/pin
   *
   * Pins a single `file` (image, JSON, or arbitrary evidence) to IPFS and
   * returns the resulting CID. The raw file is capped at 10 MB.
   *
   * Returns: { cid, url }
   *
   * @example
   * curl -X POST http://localhost:3001/ipfs/pin \
   *   -H "Authorization: Bearer <jwt>" \
   *   -F "file=@evidence.json"
   */
  @Post('pin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
        files: 1,
      },
    }),
  )
  async pin(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ cid: string; url: string }> {
    if (!file) {
      throw new BadRequestException('A `file` is required');
    }
    const cid = await this.ipfsService.pin(file.buffer, file.originalname);
    return { cid, url: `https://ipfs.io/ipfs/${cid}` };
  }
}
