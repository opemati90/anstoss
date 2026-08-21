import { PublicController } from './public.controller'

describe('PublicController Android App Links', () => {
  const previous = process.env.ANDROID_CERT_FINGERPRINTS

  afterEach(() => {
    if (previous === undefined) delete process.env.ANDROID_CERT_FINGERPRINTS
    else process.env.ANDROID_CERT_FINGERPRINTS = previous
  })

  it('always publishes the EAS signer and appends Play signing certificates', () => {
    process.env.ANDROID_CERT_FINGERPRINTS =
      'AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA'
    const controller = new PublicController({} as never)
    const [association] = controller.getAssetLinks()

    expect(association.target.package_name).toBe('com.renuirug.anstoss')
    expect(association.target.sha256_cert_fingerprints).toEqual(
      expect.arrayContaining([
        '92:FC:95:00:C7:B8:D6:55:9B:82:E4:15:53:9A:6D:D8:97:B4:74:4D:F3:89:EC:99:F5:CD:B3:40:9A:81:A1:CE',
        process.env.ANDROID_CERT_FINGERPRINTS,
      ]),
    )
  })
})
