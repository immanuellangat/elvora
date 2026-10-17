export interface Station {
  id: string
  name: string
  description: string
  kind: 'stream' | 'youtube'
  url: string
}

/** Curated online sources. Streams play through an <audio> element; YouTube embeds in a mini player. */
export const STATIONS: Station[] = [
  { id: 'groovesalad', name: 'Groove Salad', description: 'Chilled ambient & downtempo', kind: 'stream', url: 'https://ice2.somafm.com/groovesalad-128-mp3' },
  { id: 'fluid', name: 'Fluid', description: 'Instrumental hip-hop & lo-fi', kind: 'stream', url: 'https://ice2.somafm.com/fluid-128-mp3' },
  { id: 'dronezone', name: 'Drone Zone', description: 'Atmospheric, spacious textures', kind: 'stream', url: 'https://ice2.somafm.com/dronezone-128-mp3' },
  { id: 'deepspace', name: 'Deep Space One', description: 'Deep ambient electronic', kind: 'stream', url: 'https://ice2.somafm.com/deepspaceone-128-mp3' },
  { id: 'lofigirl', name: 'Lofi Girl', description: 'Beats to relax/study to (YouTube)', kind: 'youtube', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
  { id: 'synthwave', name: 'Synthwave Radio', description: 'Beats to chill/game to (YouTube)', kind: 'youtube', url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY' },
]

export interface YouTubeRef {
  videoId?: string
  listId?: string
}

export function parseYouTube(input: string): YouTubeRef | null {
  const s = input.trim()
  if (/^[\w-]{11}$/.test(s)) return { videoId: s }
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return id ? { videoId: id, listId: url.searchParams.get('list') ?? undefined } : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const listId = url.searchParams.get('list') ?? undefined
    const v = url.searchParams.get('v')
    if (v) return { videoId: v, listId }
    const m = url.pathname.match(/^\/(?:embed|live|shorts|v)\/([\w-]{11})/)
    if (m) return { videoId: m[1], listId }
    if (listId) return { listId }
  }
  return null
}

export function youTubeEmbedUrl(ref: YouTubeRef): string {
  const params = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', playsinline: '1' })
  if (ref.listId && !ref.videoId) {
    params.set('list', ref.listId)
    return `https://www.youtube-nocookie.com/embed/videoseries?${params}`
  }
  if (ref.listId) params.set('list', ref.listId)
  else {
    params.set('loop', '1')
    params.set('playlist', ref.videoId!)
  }
  return `https://www.youtube-nocookie.com/embed/${ref.videoId}?${params}`
}

export function isLikelyAudioUrl(input: string): boolean {
  try {
    const u = new URL(input.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
