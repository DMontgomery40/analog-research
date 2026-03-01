'use client'

import * as Slider from '@radix-ui/react-slider'

interface RateRangeSliderProps {
  value: [number, number]
  onChange: (value: [number, number]) => void
  min?: number
  max?: number
  step?: number
}

export function RateRangeSlider({
  value,
  onChange,
  min = 1000,
  max = 50000,
  step = 500,
}: RateRangeSliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl font-bold">
          ${(value[0] / 100).toFixed(0)}/hr
        </span>
        <span className="text-muted-foreground">to</span>
        <span className="text-2xl font-bold">
          ${(value[1] / 100).toFixed(0)}/hr
        </span>
      </div>

      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-5"
        value={value}
        onValueChange={(v) => onChange(v as [number, number])}
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={1}
      >
        <Slider.Track className="bg-muted relative grow rounded-full h-2">
          <Slider.Range className="absolute bg-primary rounded-full h-full" />
        </Slider.Track>
        <Slider.Thumb
          className="block w-5 h-5 bg-background border-2 border-primary rounded-full hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Minimum rate"
        />
        <Slider.Thumb
          className="block w-5 h-5 bg-background border-2 border-primary rounded-full hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Maximum rate"
        />
      </Slider.Root>

      <div className="flex justify-between text-xs text-muted-foreground mt-2">
        <span>${(min / 100).toFixed(0)}</span>
        <span>${(max / 100).toFixed(0)}</span>
      </div>
    </div>
  )
}
