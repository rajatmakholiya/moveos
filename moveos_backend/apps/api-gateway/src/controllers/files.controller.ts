import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileService, JwtAuthGuard } from '@common/index';
import { Response } from 'express';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ORG_ADMIN']);
const ALLOWED_UPLOAD_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

@Controller('files')
export class FilesController {
  constructor(private readonly fileService: FileService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload/:scope/:ownerId/:documentType')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Req() req: any,
    @UploadedFile() file: any,
    @Param('scope') scope: 'driver' | 'vehicle' | 'organization',
    @Param('ownerId') ownerId: string,
    @Param('documentType') documentType: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException({ message: 'file is required', error_code: 'file_required' });
    }
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({ message: 'Only JPG, PNG, WebP, or PDF files are allowed.', error_code: 'invalid_file_type' });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException({ message: 'File must be 8 MB or smaller.', error_code: 'file_too_large' });
    }
    if (!['driver', 'vehicle', 'organization'].includes(scope)) {
      throw new BadRequestException({ message: 'Invalid file scope', error_code: 'invalid_file_scope' });
    }

    // Ownership validation: drivers can only upload to their own profile
    if (scope === 'driver' && !ADMIN_ROLES.has(req.user?.role)) {
      const callerDriverId: string = req.user?.driverId ?? req.user?.sub;
      if (callerDriverId !== ownerId) {
        throw new ForbiddenException({ message: 'You may only upload files for your own driver profile', error_code: 'upload_ownership_violation' });
      }
    }

    const upload = await this.fileService.saveUploadedFile({
      scope,
      ownerId,
      documentType,
      filename: file.originalname,
      buffer: file.buffer,
      mimetype: file.mimetype,
    });
    return { status: 'ok', data: { upload } };
  }

  /**
   * Authenticated file serving.  Drivers access only their own files; admins access all.
   * Route kept at /files/public/... for backward-compat with stored file URLs.
   */
  @UseGuards(JwtAuthGuard)
  @Get('public/:scope/:ownerId/:documentType/:fileUuid/:filename')
  async secureFile(
    @Req() req: any,
    @Res() res: Response,
    @Param('scope') scope: string,
    @Param('ownerId') ownerId: string,
    @Param('documentType') documentType: string,
    @Param('fileUuid') fileUuid: string,
    @Param('filename') filename: string,
  ) {
    if (scope === 'driver' && !ADMIN_ROLES.has(req.user?.role)) {
      const callerDriverId: string = req.user?.driverId ?? req.user?.sub;
      if (callerDriverId !== ownerId) {
        throw new ForbiddenException({ message: 'Access denied', error_code: 'file_access_denied' });
      }
    }
    const objectKey = `${scope}/${ownerId}/${documentType}/${fileUuid}/${filename}`;
    return res.sendFile(await this.fileService.resolveLocalObjectPath(objectKey));
  }
}
