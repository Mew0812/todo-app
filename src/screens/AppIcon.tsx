import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../components/Sheet'

type Mode = '文字' | '数字' | '写真・画像'
const modes: Mode[] = ['文字', '数字', '写真・画像']
const iconSizes = [1024, 512, 192]
const defaultColor = '#15171e'
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null

function twoCharacters(value: string) {
  return (segmenter ? Array.from(segmenter.segment(value), item => item.segment) : Array.from(value)).slice(0, 2).join('')
}

export function AppIcon({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [letters, setLetters] = useState('日')
  const [digits, setDigits] = useState('01')
  const [background, setBackground] = useState(defaultColor)
  const [foreground, setForeground] = useState('#ffffff')
  const [file, setFile] = useState<File>()
  const [photo, setPhoto] = useState<HTMLImageElement>()
  const [zoom, setZoom] = useState(1)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [size, setSize] = useState(1024)
  const [message, setMessage] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const text = mode === '数字' ? digits : twoCharacters(letters.trim())
  const ready = mode === '写真・画像' ? Boolean(photo) : Boolean(mode && text)
  const canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => setPhoto(image)
    image.onerror = () => setMessage('画像を開けませんでした。JPG、PNG、WebPなどの画像を選んでください。')
    image.src = url
    return () => {
      image.onload = null
      image.onerror = null
      URL.revokeObjectURL(url)
    }
  }, [file])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d', { alpha: false })
    if (!ctx) return
    const edge = ctx.canvas.width
    ctx.fillStyle = mode === '写真・画像' ? defaultColor : background
    ctx.fillRect(0, 0, edge, edge)
    if (mode === '写真・画像') {
      if (!photo) return
      const scale = Math.max(edge / photo.naturalWidth, edge / photo.naturalHeight) * zoom
      const width = photo.naturalWidth * scale
      const height = photo.naturalHeight * scale
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(photo, (edge - width) * (1 - x / 100) / 2,
        (edge - height) * (1 - y / 100) / 2, width, height)
      return
    }
    if (!text) return
    ctx.fillStyle = foreground
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '700 640px system-ui, sans-serif'
    const measure = ctx.measureText(text)
    const width = measure.actualBoundingBoxLeft + measure.actualBoundingBoxRight || measure.width
    const height = measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent
    const scale = Math.min(1, edge * .68 / width, height ? edge * .68 / height : 1)
    ctx.save()
    ctx.translate(edge / 2, edge / 2)
    ctx.scale(scale, scale)
    ctx.fillText(text, (measure.actualBoundingBoxLeft - measure.actualBoundingBoxRight) / 2,
      (measure.actualBoundingBoxAscent - measure.actualBoundingBoxDescent) / 2)
    ctx.restore()
  }, [mode, text, background, foreground, photo, zoom, x, y])

  function png() {
    const output = document.createElement('canvas')
    output.width = size
    output.height = size
    const ctx = output.getContext('2d', { alpha: false })!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas.current!, 0, 0, size, size)
    return output.toDataURL('image/png')
  }

  function download() {
    const link = document.createElement('a')
    link.href = png()
    link.download = 'mytodo-icon-' + size + '.png'
    document.body.append(link)
    link.click()
    link.remove()
  }

  async function share() {
    try {
      const bytes = Uint8Array.from(atob(png().split(',')[1]), character => character.charCodeAt(0))
      const files = [new File([bytes], 'mytodo-icon-' + size + '.png', { type: 'image/png' })]
      if (!navigator.canShare({ files })) { download(); return }
      await navigator.share({ files })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('共有できませんでした。「PNGを保存」をお試しください。')
    }
  }

  return <Sheet title="アプリアイコン" onClose={onBack}>
    <div className="form-stack icon-editor">
      <button className="soft icon-editor-back" onClick={onBack}>設定に戻る</button>
      <div className="icon-editor-modes" aria-label="アイコンの種類">
        {modes.map(option => <button key={option} className="soft" aria-pressed={mode === option}
          onClick={() => { setMode(option); setMessage('') }}>{option}</button>)}
      </div>
      {mode && (mode !== '写真・画像' || photo)
        ? <canvas className="icon-preview" ref={canvas} width={1024} height={1024} role="img" aria-label="作成したアイコンのプレビュー" />
        : <img className="icon-preview" src={import.meta.env.BASE_URL + 'icon-192.png'} alt="現在のMyTodoアイコン" />}
      {mode === '文字' && <label>文字（1〜2文字）
        <input value={letters} onChange={event => setLetters(
          (event.nativeEvent as InputEvent).isComposing ? event.target.value : twoCharacters(event.target.value))}
          onCompositionEnd={event => setLetters(twoCharacters(event.currentTarget.value))} />
      </label>}
      {mode === '数字' && <label>数字（1〜2桁）
        <input value={digits} inputMode="numeric"
          onChange={event => setDigits(event.target.value.normalize('NFKC').replace(/[^0-9]/g, '').slice(0, 2))} />
      </label>}
      {(mode === '文字' || mode === '数字') && <div className="icon-editor-colors">
        <label>背景色<input type="color" value={background} onChange={event => setBackground(event.target.value)} /></label>
        <label>{mode === '文字' ? '文字色' : '数字の色'}
          <input type="color" value={foreground} onChange={event => setForeground(event.target.value)} /></label>
      </div>}
      {mode === '写真・画像' && <>
        <label>画像を選択<input type="file" accept="image/*" onChange={event => {
          const next = event.currentTarget.files?.[0]
          if (!next) return
          setFile(next); setPhoto(undefined); setMessage(''); setZoom(1); setX(0); setY(0)
        }} /></label>
        {photo && <>
          <label>拡大・縮小<input type="range" min="1" max="4" step=".01" value={zoom} onChange={event => setZoom(event.target.valueAsNumber)} /></label>
          <label>左右の位置<input type="range" min="-100" max="100" value={x} onChange={event => setX(event.target.valueAsNumber)} /></label>
          <label>上下の位置<input type="range" min="-100" max="100" value={y} onChange={event => setY(event.target.valueAsNumber)} /></label>
        </>}
      </>}
      {mode && <>
        <label>出力サイズ<select value={size} onChange={event => setSize(Number(event.target.value))}>
          {iconSizes.map(edge => <option key={edge} value={edge}>{edge} × {edge} px</option>)}
        </select></label>
        <div className="backup-buttons">
          <button className="primary" disabled={!ready} onClick={download}>PNGを保存</button>
          {canShare && <button className="soft" disabled={!ready} onClick={() => void share()}>共有・ファイルに保存</button>}
        </div>
      </>}
      {message && <p role="status">{message}</p>}
      <p className="muted">作成した画像を保存しただけでは、iPhoneのホーム画面アイコンは変更されません。PWAのアイコン設定を更新して公開した後、必要に応じてホーム画面への追加をやり直してください。</p>
    </div>
  </Sheet>
}
