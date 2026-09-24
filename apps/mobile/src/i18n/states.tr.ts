import type { StatesCopy } from './states'

export const statesTr: StatesCopy = {
  common: {
    offline: 'İnternet bağlantın yok. Bağlantını kontrol edip tekrar dene.',
    unknownError: 'Bir sorun oluştu.',
    retry: 'Tekrar dene',
  },
  home: {
    error: {
      title: 'Haftan yüklenemedi',
      body: 'Bağlantını kontrol et ve yenilemek için ekranı aşağı çek.',
    },
    stale: 'Son kaydedilen durum gösteriliyor. Yenilemek için aşağı çek.',
  },
  events: {
    empty: {
      title: 'Henüz etkinlik yok',
      body: 'Antrenör antrenman ve maçları ekledikçe burada görünür.',
      cta: 'İlk etkinliği oluştur',
    },
    error: {
      title: 'Etkinlikler yüklenemedi',
      body: 'Yenilemek için aşağı çek veya tekrar dene.',
      retry: 'Tekrar dene',
    },
  },
  pending_requests: {
    empty: {
      title: 'Bekleyen istek yok',
      body: 'Yeni katılım istekleri burada görünür.',
    },
    error: {
      title: 'İstekler yüklenemedi',
      body: 'Yenilemek için aşağı çek veya tekrar dene.',
      retry: 'Tekrar dene',
    },
  },
  admin_members: {
    empty: {
      title: 'Henüz üye yok',
      body: 'Başlamak için ilk üyeyi davet et.',
      cta: 'Üye davet et',
    },
    error: {
      title: 'Üyeler yüklenemedi',
      body: 'Yenilemek için aşağı çek veya tekrar dene.',
      hint: 'Bağlantını kontrol et ya da çıkış yapıp yeniden giriş yap.',
      retry: 'Tekrar dene',
    },
  },
  contributions: {
    empty: {
      title: 'Henüz aidat yok',
      body: 'Kulübün aidatları tanımladığında burada görünür.',
    },
    error: {
      title: 'Aidatlar yüklenemedi',
      body: 'Yenilemek için aşağı çek veya tekrar dene.',
      retry: 'Tekrar dene',
    },
  },
  team_matches: {
    empty: {
      title: 'Planlanmış maç yok',
      body: 'Yaklaşan ve oynanmış maçlar burada görünür.',
    },
    error: {
      title: 'Maçlar yüklenemedi',
      body: 'Yenilemek için aşağı çek veya tekrar dene.',
      retry: 'Tekrar dene',
    },
    noTeam: {
      title: 'Takım seçilmedi',
      body: 'Maçları görmek için bir takıma katıl veya takım seç.',
    },
  },
  transfers: {
    empty: {
      title: 'Transfer ilanı yok',
      body: 'Kulüpler müsait veya aradıkları oyuncuları burada paylaşır.',
    },
    error: {
      title: 'Transferler yüklenemedi',
      body: 'Yenilemek için aşağı çek veya tekrar dene.',
      retry: 'Tekrar dene',
    },
  },
  dm: {
    empty: {
      title: 'Henüz sohbet yok',
      body: 'Bir takım arkadaşının veya antrenörün profilinden özel mesaj başlat.',
      cta: 'Sohbet başlat',
    },
    error: {
      title: 'Mesajlar yüklenemedi',
      body: 'Yenilemek için aşağı çek veya tekrar dene.',
      retry: 'Tekrar dene',
    },
  },
  errors: {
    api: {
      title: 'Bir sorun oluştu',
      network: 'Bağlantını kontrol edip tekrar dene.',
      offline: 'İnternet bağlantın yok. Yeniden bağlanınca tekrar dene.',
      timeout: 'İstek çok uzun sürdü. Tekrar dene.',
      rateLimit: 'Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.',
      session: 'Oturumunun süresi doldu. Lütfen yeniden giriş yap.',
      permission: 'Bu işlem için yetkin yok.',
      unavailable: 'Hizmet şu an kullanılamıyor. Birazdan tekrar dene.',
      generic: 'Bir sorun oluştu. Tekrar dene.',
    },
  },
}
