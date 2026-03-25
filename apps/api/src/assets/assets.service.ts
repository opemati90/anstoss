import { Injectable } from '@nestjs/common'
import type {
  AssetPresignRequestInput,
  AssetPresignResponse,
} from '@anstoss/shared'

@Injectable()
export class AssetsService {
  createUploadIntent(
    clubId: string,
    input: AssetPresignRequestInput,
  ): AssetPresignResponse {
    const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '-')
    const objectKey = `${clubId}/${input.kind}/${Date.now()}-${safeFilename}`
    const baseUrl = process.env.R2_PUBLIC_BASE_URL || null
    const presignBaseUrl = process.env.R2_PRESIGN_BASE_URL || null

    return {
      enabled: !!presignBaseUrl,
      objectKey,
      uploadUrl: presignBaseUrl ? `${presignBaseUrl}/${objectKey}` : null,
      publicUrl: baseUrl ? `${baseUrl}/${objectKey}` : null,
    }
  }
}
