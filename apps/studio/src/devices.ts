/**
 * E-paper output profiles. Sizes are portrait, in pixels, as the manufacturer
 * publishes them. Grey levels are rarely published by the reader makers; where
 * they are not, the figure is the one the MobileRead wiki gives for E Ink Carta
 * panels (16 levels of grey; https://wiki.mobileread.com/wiki/E_Ink_Carta, checked
 * 2026-10-23), and the note says so.
 */

export type Device = {
  id: string
  name: string
  width: number
  height: number
  greys: 2 | 4 | 16
  /** Where the numbers come from. */
  note: string
  /** Generic profiles let you type your own size. */
  editable?: boolean
}

export const DEVICES: Device[] = [
  {
    id: 'kobo-clara-bw',
    name: 'Kobo Clara BW (6", 300 ppi)',
    // https://ereader.kobo.com/en-us/products/kobo-clara-bw, Technical Specs: "6” glare-free E Ink Carta 1300 HD touchscreen 1448 x 1072 resolution". Checked 2026-10-23.
    width: 1072,
    height: 1448,
    greys: 16,
    note: 'Size from Kobo’s spec page (1448 × 1072, E Ink Carta 1300). Grey levels: 16, the figure the MobileRead wiki gives for Carta panels.',
  },
  {
    id: 'kobo-libra-2',
    name: 'Kobo Libra 2 (7", 300 ppi)',
    // https://ereader.kobo.com/en-us/products/certified-refurbished-kobo-libra-2, Display: "7” HD E Ink Carta 1200 touchscreen 300 PPI, 1264 x 1680 resolution". Checked 2026-10-23.
    // Kobo's standard Libra 2 page (https://ereader.kobo.com/en-us/products/kobo-libra-2) names the panel but gives no pixel size; the refurbished listing above is Kobo's own page that does.
    width: 1264,
    height: 1680,
    greys: 16,
    note: 'Size from Kobo’s spec page (1264 × 1680, E Ink Carta 1200). Grey levels: 16, the figure the MobileRead wiki gives for Carta panels.',
  },
  {
    id: 'remarkable-2',
    name: 'reMarkable 2 (10.3", 226 dpi)',
    // https://support.remarkable.com/s/article/About-reMarkable-2, Display: "Resolution: 1872 x 1404 (226 DPI)". Checked 2026-10-23.
    width: 1404,
    height: 1872,
    greys: 16,
    note: 'Size from reMarkable’s support page (1872 × 1404). reMarkable does not publish a grey-level count; 16 is assumed.',
  },
  {
    id: 'generic-16',
    name: 'Generic 16-grey panel',
    width: 1072,
    height: 1448,
    greys: 16,
    note: 'A 4-bit greyscale panel. Type your panel’s size.',
    editable: true,
  },
  {
    id: 'generic-4',
    name: 'Generic 4-grey panel',
    width: 400,
    height: 300,
    greys: 4,
    note: 'A 2-bit greyscale panel, common on small e-paper modules. Type your panel’s size.',
    editable: true,
  },
  {
    id: 'generic-1',
    name: 'Generic 1-bit panel',
    width: 800,
    height: 480,
    greys: 2,
    note: 'Black and white only. Type your panel’s size.',
    editable: true,
  },
]

export const deviceById = (id: string): Device => DEVICES.find((d) => d.id === id) ?? DEVICES[0]
