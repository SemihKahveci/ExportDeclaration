export interface CapabilityDef {
  key: string;
  label: string;
  sensitive?: boolean;
}

export interface ScreenPerm {
  screen: string;
  route: string;
  navLabel: string;
  group: 'operasyon' | 'gtip_malzeme' | 'sistem' | 'arsiv' | 'internal';
  capabilities: CapabilityDef[];
}

export const PERMISSIONS: ScreenPerm[] = [
  {
    screen: 'dosya_takip', route: '/dosya-takip', navLabel: 'Dosya Takip', group: 'operasyon',
    capabilities: [
      { key: 'dosya_takip.view', label: 'Görüntüle' },
      { key: 'dosya_takip.edit', label: 'Düzenle' },
    ],
  },
  {
    screen: 'gtip_hazirlik', route: '/gtip-hazirlik', navLabel: 'GTİP Hazırlık', group: 'internal',
    capabilities: [
      { key: 'gtip_hazirlik.view', label: 'Görüntüle' },
      { key: 'gtip_hazirlik.edit', label: 'Düzenle' },
    ],
  },
  {
    screen: 'beyanname', route: '/beyanname', navLabel: 'Beyanname Yazım & MT Kontrol', group: 'operasyon',
    capabilities: [
      { key: 'beyanname.view', label: 'Görüntüle' },
      { key: 'beyanname.write', label: 'Yazım' },
      { key: 'beyanname.approve', label: 'Kontrol Onayı' },
      { key: 'beyanname.send', label: 'Sisteme Gönder' },
    ],
  },
  {
    screen: 'beyanname_onay', route: '/beyanname/onay', navLabel: 'Beyanname Onay', group: 'operasyon',
    capabilities: [
      { key: 'beyanname_onay.view', label: 'Görüntüle' },
      { key: 'beyanname_onay.approve', label: 'Onayla' },
    ],
  },
  {
    screen: 'tescil', route: '/tescil', navLabel: 'Beyanname Tescil', group: 'operasyon',
    capabilities: [
      { key: 'tescil.view', label: 'Görüntüle' },
      { key: 'tescil.notify', label: 'Müşteriye Bildir' },
    ],
  },
  {
    screen: 'kapanis_evraklar', route: '/kapanis/evraklar', navLabel: 'Evraklar & Beyanname Maliyetleri', group: 'operasyon',
    capabilities: [
      { key: 'kapanis.evraklar', label: 'Evraklar' },
      { key: 'kapanis.maliyet', label: 'Beyanname Maliyetleri', sensitive: true },
    ],
  },
  {
    screen: 'kapanis_operasyon_evrak_yukleme', route: '/kapanis/operasyon-evrak-yukleme', navLabel: 'Operasyon Evrak Yükleme', group: 'operasyon',
    capabilities: [
      { key: 'kapanis.evrak_yukleme', label: 'Evrak Yükleme' },
    ],
  },
  {
    screen: 'kapanis_onay', route: '/kapanis/onay', navLabel: 'Kapanış Onay', group: 'operasyon',
    capabilities: [
      { key: 'kapanis.close', label: 'Kapanışı Onayla' },
    ],
  },
  {
    screen: 'musteri_gtip_sorgulama', route: '/musteri-gtip-sorgulama', navLabel: 'Müşteri GTİP Sorgulama', group: 'gtip_malzeme',
    capabilities: [
      { key: 'musteri_gtip.view', label: 'Görüntüle' },
      { key: 'musteri_gtip.edit', label: 'Düzenle' },
    ],
  },
  {
    screen: 'gtip_malzeme', route: '/gtip-malzeme', navLabel: 'GTİP Veri Tabanı', group: 'gtip_malzeme',
    capabilities: [
      { key: 'gtip_malzeme.view', label: 'Görüntüle' },
      { key: 'gtip_malzeme.edit', label: 'Düzenle' },
    ],
  },
  {
    screen: 'gtip_onay', route: '/gtip/onay', navLabel: 'GTİP Onay', group: 'gtip_malzeme',
    capabilities: [
      { key: 'gtip_onay.view', label: 'Görüntüle' },
      { key: 'gtip_onay.approve', label: 'Onayla' },
    ],
  },
  {
    screen: 'arsiv_ithalat', route: '/arsiv/ithalat', navLabel: 'İthalat Arşivi', group: 'arsiv',
    capabilities: [{ key: 'arsiv.view', label: 'Arşiv Görüntüle' }],
  },
  {
    screen: 'arsiv_ihracat', route: '/arsiv/ihracat', navLabel: 'İhracat Arşivi', group: 'arsiv',
    capabilities: [{ key: 'arsiv.view', label: 'Arşiv Görüntüle' }],
  },
  {
    screen: 'arsiv_transit', route: '/arsiv/transit', navLabel: 'Transit Arşivi', group: 'arsiv',
    capabilities: [{ key: 'arsiv.view', label: 'Arşiv Görüntüle' }],
  },
  {
    screen: 'musteriler', route: '/musteriler', navLabel: 'Müşteriler', group: 'sistem',
    capabilities: [
      { key: 'musteriler.view', label: 'Görüntüle' },
      { key: 'musteriler.edit', label: 'Düzenle' },
    ],
  },
  {
    screen: 'evraklar', route: '/evraklar', navLabel: 'Evraklar', group: 'sistem',
    capabilities: [
      { key: 'evraklar.view', label: 'Görüntüle' },
      { key: 'evraklar.manage', label: 'Yönet (ekle/düzenle/sil)' },
    ],
  },
  {
    screen: 'mailler', route: '/mailler', navLabel: 'Mailler', group: 'sistem',
    capabilities: [
      { key: 'mailler.view', label: 'Görüntüle' },
      { key: 'mailler.manage', label: 'Yönet (ekle/düzenle/sil)' },
    ],
  },
  {
    screen: 'ayarlar', route: '/ayarlar', navLabel: 'Ayarlar', group: 'sistem',
    capabilities: [
      { key: 'ayarlar.users', label: 'Kullanıcı & Yetki Yönetimi', sensitive: true },
      { key: 'ayarlar.document_processes', label: 'Doküman Süreçleri' },
      { key: 'ayarlar.mails', label: 'Mailler' },
    ],
  },
];

export const EXTRA_CAPABILITIES: CapabilityDef[] = [
  { key: 'audit.view', label: 'Denetim Kayıtlarını Gör', sensitive: true },
];

export const ALL_CAPABILITY_KEYS: string[] = [
  ...PERMISSIONS.flatMap((s) => s.capabilities.map((c) => c.key)),
  ...EXTRA_CAPABILITIES.map((c) => c.key),
];
