$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$source = @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class BattleSuitAtlasV6
{
    private const int FrameWidth = 384;
    private const int FrameHeight = 512;
    private const int AtlasWidth = FrameWidth * 4;
    private const int AtlasHeight = FrameHeight * 2;

    private static byte[] ReadArgb(Bitmap bitmap, out int stride)
    {
        Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        BitmapData data = bitmap.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try
        {
            stride = Math.Abs(data.Stride);
            byte[] bytes = new byte[stride * bitmap.Height];
            Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
            return bytes;
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    private static void WriteArgb(Bitmap bitmap, byte[] bytes)
    {
        Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        BitmapData data = bitmap.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        try
        {
            Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    private static bool IsChecker(byte b, byte g, byte r)
    {
        int min = Math.Min(r, Math.Min(g, b));
        int max = Math.Max(r, Math.Max(g, b));
        return min >= 205 && max - min <= 18;
    }

    private static void SeedBackground(
        int x,
        int y,
        int width,
        int stride,
        byte[] pixels,
        bool[] background,
        int[] queue,
        ref int queueTail)
    {
        int index = y * width + x;
        if (background[index]) return;
        int offset = y * stride + x * 4;
        if (!IsChecker(pixels[offset], pixels[offset + 1], pixels[offset + 2])) return;
        background[index] = true;
        queue[queueTail++] = index;
    }

    private static Bitmap LoadArgb(string path)
    {
        Bitmap source = new Bitmap(path);
        if (source.PixelFormat == PixelFormat.Format32bppArgb)
        {
            return source;
        }

        Rectangle bounds = new Rectangle(0, 0, source.Width, source.Height);
        Bitmap argb = source.Clone(bounds, PixelFormat.Format32bppArgb);
        source.Dispose();
        return argb;
    }

    public static Bitmap ExtractFirstAuthoredSprite(string path)
    {
        using (Bitmap source = LoadArgb(path))
        {
            int width = source.Width;
            int height = source.Height;
            int stride;
            byte[] pixels = ReadArgb(source, out stride);
            bool[] background = new bool[width * height];
            int[] queue = new int[width * height];
            int queueHead = 0;
            int queueTail = 0;

            for (int x = 0; x < width; x++)
            {
                SeedBackground(x, 0, width, stride, pixels, background, queue, ref queueTail);
                SeedBackground(x, height - 1, width, stride, pixels, background, queue, ref queueTail);
            }
            for (int y = 0; y < height; y++)
            {
                SeedBackground(0, y, width, stride, pixels, background, queue, ref queueTail);
                SeedBackground(width - 1, y, width, stride, pixels, background, queue, ref queueTail);
            }

            int[] dx = { -1, 1, 0, 0 };
            int[] dy = { 0, 0, -1, 1 };
            while (queueHead < queueTail)
            {
                int index = queue[queueHead++];
                int x = index % width;
                int y = index / width;
                for (int direction = 0; direction < 4; direction++)
                {
                    int nx = x + dx[direction];
                    int ny = y + dy[direction];
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    int next = ny * width + nx;
                    if (background[next]) continue;
                    int offset = ny * stride + nx * 4;
                    if (!IsChecker(pixels[offset], pixels[offset + 1], pixels[offset + 2])) continue;
                    background[next] = true;
                    queue[queueTail++] = next;
                }
            }

            int firstFrameRight = Math.Min(width - 1, (int)Math.Floor(width * 0.278));
            int[] componentLabels = new int[width * height];
            int currentLabel = 0;
            int bestLabel = 0;
            int bestCount = 0;
            int[] nx8 = { -1, 0, 1, -1, 1, -1, 0, 1 };
            int[] ny8 = { -1, -1, -1, 0, 0, 1, 1, 1 };

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x <= firstFrameRight; x++)
                {
                    int start = y * width + x;
                    if (background[start] || componentLabels[start] != 0) continue;
                    int startOffset = y * stride + x * 4;
                    if (pixels[startOffset + 3] == 0) continue;
                    currentLabel++;
                    int componentCount = 0;
                    queueHead = 0;
                    queueTail = 0;
                    componentLabels[start] = currentLabel;
                    queue[queueTail++] = start;
                    while (queueHead < queueTail)
                    {
                        int current = queue[queueHead++];
                        componentCount++;
                        int cx = current % width;
                        int cy = current / width;
                        for (int direction = 0; direction < 8; direction++)
                        {
                            int px = cx + nx8[direction];
                            int py = cy + ny8[direction];
                            if (px < 0 || py < 0 || px > firstFrameRight || py >= height) continue;
                            int next = py * width + px;
                            if (background[next] || componentLabels[next] != 0) continue;
                            int offset = py * stride + px * 4;
                            if (pixels[offset + 3] == 0) continue;
                            componentLabels[next] = currentLabel;
                            queue[queueTail++] = next;
                        }
                    }
                    if (componentCount > bestCount)
                    {
                        bestCount = componentCount;
                        bestLabel = currentLabel;
                    }
                }
            }

            if (bestCount < 10000) throw new InvalidOperationException("No authored sprite component found: " + path);

            int minX = width, minY = height, maxX = -1, maxY = -1;
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x <= firstFrameRight; x++)
                {
                    int index = y * width + x;
                    if (componentLabels[index] != bestLabel) continue;
                    minX = Math.Min(minX, x);
                    minY = Math.Min(minY, y);
                    maxX = Math.Max(maxX, x);
                    maxY = Math.Max(maxY, y);
                }
            }

            int padding = 2;
            minX = Math.Max(0, minX - padding);
            minY = Math.Max(0, minY - padding);
            maxX = Math.Min(firstFrameRight, maxX + padding);
            maxY = Math.Min(height - 1, maxY + padding);
            Bitmap extracted = new Bitmap(maxX - minX + 1, maxY - minY + 1, PixelFormat.Format32bppArgb);
            byte[] output = new byte[extracted.Width * extracted.Height * 4];
            for (int y = minY; y <= maxY; y++)
            {
                for (int x = minX; x <= maxX; x++)
                {
                    int sourceIndex = y * width + x;
                    if (componentLabels[sourceIndex] != bestLabel) continue;
                    int sourceOffset = y * stride + x * 4;
                    int targetOffset = ((y - minY) * extracted.Width + (x - minX)) * 4;
                    output[targetOffset] = pixels[sourceOffset];
                    output[targetOffset + 1] = pixels[sourceOffset + 1];
                    output[targetOffset + 2] = pixels[sourceOffset + 2];
                    output[targetOffset + 3] = 255;
                }
            }
            WriteArgb(extracted, output);
            return extracted;
        }
    }

    private static Bitmap BuildRow(string generatedPath)
    {
        using (Bitmap source = ExtractFirstAuthoredSprite(generatedPath))
        {
            double scale = Math.Min(374.0 / source.Width, 440.0 / source.Height);
            int drawWidth = Math.Max(1, (int)Math.Round(source.Width * scale));
            int drawHeight = Math.Max(1, (int)Math.Round(source.Height * scale));
            int baseLeft = (FrameWidth - drawWidth) / 2;
            int baseTop = 479 - drawHeight + 1;
            // User-approved static stance: every runtime phase reuses the same
            // crisp authored frame. Recoil is communicated only by the V3
            // muzzle effect and audio, never by a face/body redraw or lunge.
            using (Bitmap frame = new Bitmap(FrameWidth, FrameHeight, PixelFormat.Format32bppArgb))
            {
                using (Graphics graphics = Graphics.FromImage(frame))
                {
                    graphics.Clear(Color.Transparent);
                    graphics.CompositingMode = CompositingMode.SourceCopy;
                    graphics.CompositingQuality = CompositingQuality.HighQuality;
                    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    graphics.SmoothingMode = SmoothingMode.HighQuality;
                    Rectangle destination = new Rectangle(baseLeft, baseTop, drawWidth, drawHeight);
                    graphics.DrawImage(source, destination, 0, 0, source.Width, source.Height, GraphicsUnit.Pixel);
                }

                int frameStride;
                byte[] frameBytes = ReadArgb(frame, out frameStride);
                Bitmap row = new Bitmap(AtlasWidth, FrameHeight, PixelFormat.Format32bppArgb);
                int rowStride;
                byte[] rowBytes = ReadArgb(row, out rowStride);
                for (int y = 0; y < FrameHeight; y++)
                {
                    int sourceOffset = y * frameStride;
                    for (int frameIndex = 0; frameIndex < 4; frameIndex++)
                    {
                        Buffer.BlockCopy(frameBytes, sourceOffset, rowBytes, y * rowStride + frameIndex * FrameWidth * 4, FrameWidth * 4);
                    }
                }
                WriteArgb(row, rowBytes);
                return row;
            }
        }
    }

    private static void BlitRow(Bitmap source, int sourceRow, Bitmap target, int targetRow)
    {
        int sourceStride;
        int targetStride;
        byte[] sourceBytes = ReadArgb(source, out sourceStride);
        byte[] targetBytes = ReadArgb(target, out targetStride);
        int sourceY = sourceRow * FrameHeight;
        int targetY = targetRow * FrameHeight;
        int copyBytes = AtlasWidth * 4;
        for (int y = 0; y < FrameHeight; y++)
        {
            Buffer.BlockCopy(sourceBytes, (sourceY + y) * sourceStride, targetBytes, (targetY + y) * targetStride, copyBytes);
        }
        WriteArgb(target, targetBytes);
    }

    public static void BuildTwoGeneratedRows(string topGenerated, string bottomGenerated, string outputPath)
    {
        using (Bitmap top = BuildRow(topGenerated))
        using (Bitmap bottom = BuildRow(bottomGenerated))
        using (Bitmap atlas = new Bitmap(AtlasWidth, AtlasHeight, PixelFormat.Format32bppArgb))
        {
            BlitRow(top, 0, atlas, 0);
            BlitRow(bottom, 0, atlas, 1);
            atlas.Save(outputPath, ImageFormat.Png);
        }
    }

    public static void BuildGeneratedTopPreservedBottom(string topGenerated, string oldAtlasPath, string outputPath)
    {
        using (Bitmap top = BuildRow(topGenerated))
        using (Bitmap oldAtlas = LoadArgb(oldAtlasPath))
        using (Bitmap atlas = new Bitmap(AtlasWidth, AtlasHeight, PixelFormat.Format32bppArgb))
        {
            BlitRow(top, 0, atlas, 0);
            BlitRow(oldAtlas, 1, atlas, 1);
            atlas.Save(outputPath, ImageFormat.Png);
        }
    }

    public static void BuildPreservedTopGeneratedBottom(string oldAtlasPath, string bottomGenerated, string outputPath)
    {
        using (Bitmap oldAtlas = LoadArgb(oldAtlasPath))
        using (Bitmap bottom = BuildRow(bottomGenerated))
        using (Bitmap atlas = new Bitmap(AtlasWidth, AtlasHeight, PixelFormat.Format32bppArgb))
        {
            BlitRow(oldAtlas, 0, atlas, 0);
            BlitRow(bottom, 0, atlas, 1);
            atlas.Save(outputPath, ImageFormat.Png);
        }
    }
}
'@

$drawingAssemblies = @(
    [System.Drawing.Bitmap].Assembly.Location,
    [System.Drawing.Rectangle].Assembly.Location,
    (Join-Path $PSHOME 'System.Runtime.dll'),
    (Join-Path $PSHOME 'System.Private.CoreLib.dll'),
    (Join-Path $PSHOME 'System.Collections.dll'),
    (Join-Path $PSHOME 'System.Runtime.InteropServices.dll'),
    (Join-Path $PSHOME 'System.Private.Windows.GdiPlus.dll'),
    (Join-Path $PSHOME 'System.Private.Windows.Core.dll')
) | Select-Object -Unique
Add-Type -TypeDefinition $source -ReferencedAssemblies $drawingAssemblies

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$assetRoot = Join-Path $root 'assets\ui\project-v\account-battle-suits'
$sources = Join-Path $assetRoot 'sources'
$animations = Join-Path $assetRoot 'animations'

[BattleSuitAtlasV6]::BuildTwoGeneratedRows(
    (Join-Path $sources 'battle-suit-01-m4a1-imagegen-authored-v6.png'),
    (Join-Path $sources 'battle-suit-01-m200-imagegen-authored-v6.png'),
    (Join-Path $animations 'battle-suit-01-m4a1-m200-horizontal-fire-atlas-v6.png')
)
[BattleSuitAtlasV6]::BuildGeneratedTopPreservedBottom(
    (Join-Path $sources 'battle-suit-01-ak-imagegen-authored-v6.png'),
    (Join-Path $animations 'battle-suit-01-ak-sks-horizontal-fire-atlas-v5.png'),
    (Join-Path $animations 'battle-suit-01-ak-sks-horizontal-fire-atlas-v6.png')
)
[BattleSuitAtlasV6]::BuildPreservedTopGeneratedBottom(
    (Join-Path $animations 'battle-suit-02-m4a1-m200-horizontal-fire-atlas-v3.png'),
    (Join-Path $sources 'battle-suit-02-m200-imagegen-authored-v6.png'),
    (Join-Path $animations 'battle-suit-02-m4a1-m200-horizontal-fire-atlas-v6.png')
)
[BattleSuitAtlasV6]::BuildPreservedTopGeneratedBottom(
    (Join-Path $animations 'battle-suit-03-m4a1-m200-horizontal-fire-atlas-v3.png'),
    (Join-Path $sources 'battle-suit-03-m200-imagegen-authored-v6.png'),
    (Join-Path $animations 'battle-suit-03-m4a1-m200-horizontal-fire-atlas-v6.png')
)

Get-ChildItem -LiteralPath $animations -Filter '*horizontal-fire-atlas-v6.png' |
    Sort-Object Name |
    Select-Object Name, Length
