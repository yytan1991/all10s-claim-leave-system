import { ExternalLink } from 'lucide-react'

// YouTube links play right on the page; other video links open in a new tab.
function youtubeEmbed(url) {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

// Shows one learning material: a note's text, a playable video, or a file link.
export default function MaterialView({ material }) {
  const m = material

  if (m.material_type === 'note') {
    return <p className="text-sm text-ink-700 whitespace-pre-wrap">{m.description}</p>
  }

  if (m.material_type === 'video') {
    const embed = youtubeEmbed(m.url)
    if (embed) {
      return (
        <div className="aspect-video">
          <iframe src={embed} title={m.title} className="w-full h-full rounded-md" allowFullScreen />
        </div>
      )
    }
    if (m.storage_path) {
      return <video src={m.url} controls className="rounded-md w-full aspect-video bg-black" />
    }
    return (
      <a href={m.url} target="_blank" rel="noreferrer" className="btn-secondary text-sm inline-flex">
        <ExternalLink size={14} /> Open video
      </a>
    )
  }

  return (
    <a href={m.url} target="_blank" rel="noreferrer" className="btn-secondary text-sm inline-flex">
      <ExternalLink size={14} /> Open {m.file_name ? m.file_name : 'file'}
    </a>
  )
}
