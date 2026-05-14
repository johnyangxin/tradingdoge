import React from 'react';
import type { UTCTimestamp } from 'lightweight-charts';

interface ChartProps {
  data: Array<{
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  ma25: Array<{ time: UTCTimestamp; value: number }>;
  ma90: Array<{ time: UTCTimestamp; value: number }>;
}

export const StockChart: React.FC<ChartProps> = ({ data, ma25, ma90 }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<any>(null);
  const seriesRef = React.useRef<any>(null);
  const line25Ref = React.useRef<any>(null);
  const line90Ref = React.useRef<any>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    import('lightweight-charts').then((charts) => {
      const { createChart, ColorType } = charts;

      if (chartRef.current) {
        chartRef.current.remove();
      }

      const container = containerRef.current;
      if (!container) return;

      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: '#242424' },
          textColor: '#888'
        },
        grid: {
          vertLines: { color: '#333' },
          horzLines: { color: '#333' }
        },
        width: container.clientWidth,
        height: container.clientHeight || 420,
        timeScale: {
          borderColor: '#333',
          timeVisible: true,
          secondsVisible: false
        },
        rightPriceScale: {
          borderColor: '#333'
        }
      });

      chartRef.current = chart;

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#00ff88',
        downColor: '#ff4444',
        borderUpColor: '#00ff88',
        borderDownColor: '#ff4444',
        wickUpColor: '#00ff88',
        wickDownColor: '#ff4444'
      });

      const line25 = chart.addLineSeries({
        color: '#ffd700',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false
      });

      const line90 = chart.addLineSeries({
        color: '#00bfff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false
      });

      seriesRef.current = candleSeries;
      line25Ref.current = line25;
      line90Ref.current = line90;

      if (data.length > 0) {
        candleSeries.setData(data);
        line25.setData(ma25);
        line90.setData(ma90);
        chart.timeScale().fitContent();
      }

      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight || 420
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    });
  }, []);

  React.useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data);
      line25Ref.current?.setData(ma25);
      line90Ref.current?.setData(ma90);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data, ma25, ma90]);

  return <div ref={containerRef} className="chart-wrapper" />;
};

export default StockChart;