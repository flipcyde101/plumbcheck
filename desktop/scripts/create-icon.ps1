Add-Type -AssemblyName System.Drawing
$assetDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets'))
$bitmap = [Drawing.Bitmap]::new(256, 256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$ink = [Drawing.ColorTranslator]::FromHtml('#0a0a0a')
$graphics.Clear([Drawing.ColorTranslator]::FromHtml('#f4f1e9'))
$pen = [Drawing.Pen]::new($ink, 8)
$graphics.DrawRectangle($pen, 4, 4, 248, 248)
function Fill-Polygon([string]$Color, [int[]]$Coordinates) {
  $points = for ($index = 0; $index -lt $Coordinates.Length; $index += 2) { [Drawing.Point]::new($Coordinates[$index], $Coordinates[$index + 1]) }
  $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($Color))
  $graphics.FillPolygon($brush, [Drawing.Point[]]$points)
  $brush.Dispose()
}
Fill-Polygon '#ff36a4' @(78,54,40,54,40,202,78,202,78,182,60,182,60,74,78,74)
Fill-Polygon '#3024ff' @(184,54,222,54,222,202,184,202,184,182,202,182,202,74,184,74)
Fill-Polygon '#0a0a0a' @(96,58,158,58,182,80,182,120,158,142,122,142,122,200,96,200)
Fill-Polygon '#f4f1e9' @(122,82,122,118,150,118,158,110,158,90,150,82)
Fill-Polygon '#c8ff00' @(154,166,182,166,182,194,154,194)
$bitmap.Save((Join-Path $assetDir 'icon.png'), [Drawing.Imaging.ImageFormat]::Png)
$png = [IO.File]::ReadAllBytes((Join-Path $assetDir 'icon.png'))
$writer = [IO.BinaryWriter]::new([IO.File]::Create((Join-Path $assetDir 'icon.ico')))
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22)
$writer.Write($png); $writer.Dispose(); $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
