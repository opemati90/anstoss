import { Injectable } from '@nestjs/common'
import type { AssetPresignRequestInput, AssetPresignResponse } from '@anstoss/shared'
import { R2Provider } from './r2.provider'

@Injectable()
export class AssetsService {
  constructor(private readonly r2: R2Provider) {}

  async createUploadIntent(
    clubId: string,
    input: AssetPresignRequestInput,
  ): Promise<AssetPresignResponse> {
    const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '-')
    const objectKey = `${clubId}/${input.kind}/${Date.now()}-${safeFilename}`

    if (!this.r2.enabled) {
      return { enabled: false, objectKey, uploadUrl: null, publicUrl: null }
    }

    const { uploadUrl, publicUrl } = await this.r2.presignPut(
      objectKey,
      input.contentType || 'image/png',
    )

    return { enabled: true, objectKey, uploadUrl, publicUrl }
  }
}
