export interface ScrapeConfig {
  location: string
  type: 'nightly' | 'monthly'
  checkin?: string
  checkout?: string
  months?: number
  month_start?: string
  price_min?: number
  price_max?: number
  adults?: number
  children?: number
  place_type?: string
  currency: string
  lang: string
  domain: string
  proxy?: string
  max_pages?: number
  with_host?: boolean
}

export interface Room {
  room_id: string
  name: string
  price: string
  price_label: string
  rating: string
  review_count: string
  lat: string | number
  lng: string | number
  image: string
  all_images: string[] | string
  url: string
  host_name: string
  host_id: string
  host_url: string
  host_avatar: string
  host_phone: string
}

export interface RoomDetailData {
  room_id: string
  url: string
  title: string
  description: string
  room_type: string
  person_capacity: number
  is_super_host: boolean
  is_guest_favorite: boolean
  coordinates: { latitude?: number; longitude?: number }
  rating: Record<string, number | string>
  images: { url: string; title: string }[]
  amenities: { title: string; values: { title: string; available: boolean }[] }[]
  highlights: { title: string; subtitle: string }[]
  house_rules: any
  location_descriptions: any[]
  sleeping_arrangements: { title: string; beds: string[] }[]
  host: { name?: string; id?: string; avatar?: string; url?: string; phone?: string }
}

export interface SessionRow {
  id: number
  location: string
  room_count: number
  created_at: string
}

export type ScrapeEvent =
  | { type: 'status'; msg: string }
  | { type: 'meta'; pages: number; location: string }
  | { type: 'room'; data: Room }
  | { type: 'progress'; page: number; total_pages: number; count: number; phase?: string }
  | { type: 'done'; count: number }
  | { type: 'error'; msg: string }

export const DEFAULT_CONFIG: ScrapeConfig = {
  location: 'Đà Nẵng, Việt Nam',
  type: 'nightly',
  checkin: '',
  checkout: '',
  months: 1,
  month_start: '',
  price_min: 0,
  price_max: 0,
  adults: 2,
  children: 0,
  place_type: '',
  currency: 'VND',
  lang: 'vi',
  domain: 'www.airbnb.com.vn',
  proxy: '',
  max_pages: 0,
  with_host: false
}
