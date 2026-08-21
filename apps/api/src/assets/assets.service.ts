import { BadRequestException, Injectable } from '@nestjs/common'
import type { AssetPresignRequestInput, AssetPresignResponse } from '@anstoss/shared'
import { R2Provider } from './r2.provider'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])

@Injectable()
export class AssetsService {
  constructor(private readonly r2: R2Provider) {}

  async createUploadIntent(
    clubId: string,
    input: AssetPresignRequestInput,
  ): Promise<AssetPresignResponse> {
    if (!IMAGE_TYPES.has(input.contentType)) {
      throw new BadRequestException('Unsupported asset content type')
    }
    const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '-')
    const objectKey = `${clubId}/${input.kind}/${Date.now()}-${safeFilename}`

    if (!this.r2.enabled) {
      return { enabled: false, objectKey, uploadUrl: null, publicUrl: null }
    }

    const { uploadUrl, publicUrl } = await this.r2.presignPut(
      objectKey,
      input.contentType || 'image/png',
      input.sizeBytes,
    )

    return { enabled: true, objectKey, uploadUrl, publicUrl }
  }
}
