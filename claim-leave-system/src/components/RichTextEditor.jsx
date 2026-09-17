import { useEffect, useRef, useState } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { Smile } from 'lucide-react'
import { EMOJI_LIST } from '../lib/emojiList'

const FONT_WHITELIST = ['sans-serif', 'serif', 'monospace']
const SIZE_WHITELIST = ['small', false, 'large', 'huge']

// Register the font/size whitelists once per app load, not per component
// mount, since Quill's format registry is global.
let formatsRegistered = false
function ensureFormatsRegistered() {
  if (formatsRegistered) return
  const Font = Quill.import('formats/font')
  Font.whitelist = FONT_WHITELIST
  Quill.register(Font, true)

  const Size = Quill.import('formats/size')
  Size.whitelist = SIZE_WHITELIST
  Quill.register(Size, true)

  formatsRegistered = true
}

export default function RichTextEditor({ value, onChange, placeholder }) {
  const containerRef = useRef(null)
  const quillRef = useRef(null)
  const toolbarRef = useRef(null)
  const [showEmoji, setShowEmoji] = useState(false)

  useEffect(() => {
    ensureFormatsRegistered()
    if (!containerRef.current || quillRef.current) return

    const quill = new Quill(containerRef.current, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: {
          container: toolbarRef.current,
        },
      },
    })

    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value)
    }

    quill.on('text-change', () => {
      const html = quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML
      onChange(html)
    })

    quillRef.current = quill
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function insertEmoji(emoji) {
    const quill = quillRef.current
    if (!quill) return
    const range = quill.getSelection(true)
    const index = range ? range.index : quill.getLength()
    quill.insertText(index, emoji)
    quill.setSelection(index + emoji.length)
    setShowEmoji(false)
  }

  return (
    <div className="rounded-md border border-sand-200 overflow-hidden">
      <div ref={toolbarRef} className="border-b border-sand-200 bg-sand-50 flex flex-wrap items-center">
        <select className="ql-font" defaultValue="sans-serif">
          <option value="sans-serif">Sans Serif</option>
          <option value="serif">Serif</option>
          <option value="monospace">Monospace</option>
        </select>
        <select className="ql-size" defaultValue={false}>
          <option value="small">Small</option>
          <option value={false}>Normal</option>
          <option value="large">Large</option>
          <option value="huge">Huge</option>
        </select>
        <button className="ql-bold" />
        <button className="ql-italic" />
        <button className="ql-underline" />
        <select className="ql-color" />
        <select className="ql-align" />
        <button className="ql-list" value="ordered" />
        <button className="ql-list" value="bullet" />
        <button className="ql-link" />
        <button className="ql-clean" />
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            className="ql-formats inline-flex items-center justify-center h-full px-1.5 text-ink-500 hover:text-ink-900"
            title="Insert emoji"
          >
            <Smile size={16} />
          </button>
          {showEmoji && (
            <div className="absolute z-20 top-full left-0 mt-1 w-64 max-h-52 overflow-y-auto card p-2 grid grid-cols-8 gap-1 shadow-md bg-white">
              {EMOJI_LIST.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insertEmoji(e)}
                  className="text-lg hover:bg-sand-100 rounded p-1"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div ref={containerRef} className="bg-white min-h-[160px]" />
    </div>
  )
}
