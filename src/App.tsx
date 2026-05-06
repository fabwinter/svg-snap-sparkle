import { useCallback, useEffect, useRef, useState } from 'react';
import ImageImport from '@/components/ImageImport';
import SettingsPanel from '@/components/SettingsPanel';
import ProcessingState from '@/components/ProcessingState';
import PreviewCanvas from '@/components/PreviewCanvas';
import ActionBar from '@/components/ActionBar';
import { WorkerClient } from '@/services/worker-client';
import { PresetType, PRESETS, buildTraceConfig, buildMaskConfig, getDefaultAdvanced } from '@/types/preset';
import { DEFAULT_CLEANUP } from '@/types/pipeline';
import { Sparkles } from 'lucide-react';
import type { AdvancedSettings } from '@/components/SettingsPanel';
import { detectPaletteHex, hexToRgb } from '@/utils/palette-detect';

type AppStep = 'import' | 'settings' | 'processing' | 'preview';

export default function App() {
  const workerClient = useRef(new WorkerClient());

  const [step, setStep] = useState<AppStep>('import');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [preset, setPreset] = useState<PresetType>('logo');
  const [colorCount, setColorCount] = useState(2);
  const [removeBg, setRemoveBg] = useState(true);
  const [advanced, setAdvanced] = useState<AdvancedSettings>(() => getDefaultAdvanced('logo'));
  const [svgString, setSvgString] = useState<string | null>(null);
  const [svgWidth, setSvgWidth] = useState(0);
  const [svgHeight, setSvgHeight] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [paletteEdited, setPaletteEdited] = useState(false);

  // Auto-detect palette whenever the image or requested colour count changes,
  // unless the user has manually edited the palette.
  useEffect(() => {
    if (!imageData) { setPalette([]); setPaletteEdited(false); return; }
    if (paletteEdited) return;
    const hexes = detectPaletteHex(imageData, colorCount);
    setPalette(hexes);
  }, [imageData, colorCount, paletteEdited]);

  const handleImageLoaded = useCallback((file: File, data: ImageData) => {
    setSourceFile(file);
    setImageData(data);
    setPaletteEdited(false);
    setStep('settings');
  }, []);

  const handlePresetChange = useCallback((p: PresetType) => {
    setPreset(p);
    setColorCount(PRESETS[p].colorCount);
    setRemoveBg(PRESETS[p].removeBg);
    setAdvanced(getDefaultAdvanced(p));
    setPaletteEdited(false);
  }, []);

  const handlePaletteChange = useCallback((next: string[]) => {
    setPalette(next);
    setPaletteEdited(true);
  }, []);

  const handleConvert = useCallback(async () => {
    if (!imageData) return;
    setStep('processing');
    setError(null);
    setProgressStage('Analysing...');
    setProgressPercent(0);

    try {
      const traceConfig = buildTraceConfig(preset, colorCount, advanced);
      if (palette.length > 0) {
        traceConfig.palette = palette.map(hexToRgb);
        traceConfig.colorPrecision = palette.length;
      }
      const maskConfig = buildMaskConfig(removeBg);
      const result = await workerClient.current.process(
        imageData, maskConfig, DEFAULT_CLEANUP, traceConfig,
        { onProgress: (stage, percent) => { setProgressStage(stage); setProgressPercent(percent); } }
      );
      setSvgString(result.svgString);
      setSvgWidth(result.width);
      setSvgHeight(result.height);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [imageData, preset, colorCount, removeBg, advanced]);

  const handleRerun = useCallback(() => {
    setSvgString(null);
    setStep('settings');
  }, []);

  const handleReset = useCallback(() => {
    setSourceFile(null);
    setImageData(null);
    setSvgString(null);
    setStep('import');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[720px] mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <header className="text-center space-y-1 pb-2">
          <h1 className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            SVGmagic Lite
          </h1>
          <p className="text-xs text-muted-foreground">
            Convert raster images to clean SVG vectors
          </p>
        </header>

        {/* Step: Import (always visible so user can see loaded image) */}
        <ImageImport
          onImageLoaded={handleImageLoaded}
          sourceFile={sourceFile}
          imageData={imageData}
          onReset={handleReset}
        />

        {/* Step: Settings */}
        {(step === 'settings' || step === 'processing' || step === 'preview') && (
          <SettingsPanel
            preset={preset}
            colorCount={colorCount}
            removeBg={removeBg}
            hasImage={!!imageData}
            advanced={advanced}
            onPresetChange={handlePresetChange}
            onColorCountChange={setColorCount}
            onRemoveBgChange={setRemoveBg}
            onAdvancedChange={setAdvanced}
            onConvert={handleConvert}
          />
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <ProcessingState
            stage={progressStage}
            percent={progressPercent}
            error={error}
            onRetry={handleConvert}
          />
        )}

        {/* Step: Preview + Actions */}
        {step === 'preview' && svgString && sourceFile && (
          <>
            <PreviewCanvas
              originalFile={sourceFile}
              svgString={svgString}
              svgWidth={svgWidth}
              svgHeight={svgHeight}
            />
            <ActionBar
              svgString={svgString}
              originalFilename={sourceFile.name}
              onRerun={handleRerun}
              onNewImage={handleReset}
            />
          </>
        )}
      </div>
    </div>
  );
}
