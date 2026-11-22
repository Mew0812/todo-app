import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('creates opaque PNGs from text, digits and a local photo, without changing PWA identity', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: 'アプリアイコン', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'アプリアイコン' })
  await expect(editor.getByRole('img', { name: '現在のMyTodoアイコン' })).toBeVisible()
  await expect(editor.getByText('作成した画像を保存しただけでは', { exact: false })).toBeVisible()
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', './icon-192.png')
  const manifest = await (await page.request.get('./manifest.webmanifest')).json()
  expect([manifest.display, manifest.start_url, manifest.scope]).toEqual(['standalone', './', './'])

  await editor.getByRole('button', { name: '文字', exact: true }).click()
  await editor.getByLabel('文字（1〜5文字）').fill('仕事A★👩‍💻過')
  await expect(editor.getByLabel('文字（1〜5文字）')).toHaveValue('仕事A★👩‍💻')
  await editor.getByLabel('背景色').fill('#103060')
  const canvas = editor.locator('canvas')
  const pixel = (x: number, y: number) => canvas.evaluate((element: HTMLCanvasElement, [x, y]) =>
    Array.from(element.getContext('2d')!.getImageData(x, y, 1, 1).data), [x, y])
  await expect.poll(() => pixel(0, 0)).toEqual([16, 48, 96, 255])
  const textPng = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())
  await editor.getByRole('button', { name: '数字', exact: true }).click()
  await editor.getByLabel('数字（1〜2桁）').fill('０７８')
  await expect(editor.getByLabel('数字（1〜2桁）')).toHaveValue('07')
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(textPng)

  await editor.getByRole('button', { name: '写真・画像', exact: true }).click()
  const base64 = await page.evaluate(() => {
    const sample = document.createElement('canvas')
    sample.width = 300
    sample.height = 120
    const ctx = sample.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 150, 120)
    ctx.fillStyle = '#0000ff'
    ctx.fillRect(150, 0, 150, 120)
    return sample.toDataURL().split(',')[1]
  })
  await editor.getByLabel('画像を選択').setInputFiles({
    name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64'),
  })
  await expect(canvas).toBeVisible()
  await editor.getByLabel('拡大・縮小').fill('2')
  await editor.getByLabel('左右の位置').fill('100')
  await expect.poll(() => pixel(512, 512)).toEqual([255, 0, 0, 255])
  await editor.getByLabel('左右の位置').fill('-100')
  await expect.poll(() => pixel(512, 512)).toEqual([0, 0, 255, 255])

  for (const size of [1024, 192, 512]) {
    await editor.getByLabel('出力サイズ').selectOption(String(size))
    const download = page.waitForEvent('download')
    await editor.getByRole('button', { name: 'PNGを保存' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('mytodo-icon-' + size + '.png')
    const png = await readFile((await file.path())!)
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size])
  }
  await editor.getByRole('button', { name: '設定に戻る' }).click()
  await expect(page.getByRole('dialog', { name: '設定' })).toBeVisible()
})
