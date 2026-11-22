import React, { useId } from "react";
import { largestDrop, type PitchSentence, type SegmentCurve } from "../pitch/pitch-analysis";

interface ChartSeries {
  label: string;
  points: ReadonlyMap<number, number>;
  dropIndex?: number;
}

interface InterestChartProps {
  sentences: readonly PitchSentence[];
  curves: readonly SegmentCurve[];
}

const shades = ["#2563eb", "#0f766e", "#9333ea", "#b45309"];
const width = 640;
const height = 250;
const left = 52;
const right = 24;
const top = 16;
const bottom = 38;

function y(interest: number): number {
  return top + ((7 - interest) * (height - top - bottom)) / 6;
}

function seriesPath(
  series: ChartSeries,
  sentences: readonly PitchSentence[],
  x: (position: number) => number,
): string {
  let previousWasScored = false;
  const commands: string[] = [];
  for (const [position, sentence] of sentences.entries()) {
    const score = series.points.get(sentence.index);
    if (score === undefined) {
      previousWasScored = false;
      continue;
    }
    commands.push(`${previousWasScored ? "L" : "M"} ${x(position)} ${y(score)}`);
    previousWasScored = true;
  }
  return commands.join(" ");
}

export function InterestChart({ sentences, curves }: InterestChartProps) {
  const titleId = useId();
  const series = curves.map((curve): ChartSeries => ({
    label: curve.segment,
    points: new Map(curve.points.flatMap((point) =>
      point.interest === null ? [] : [[point.index, point.interest] as const],
    )),
    dropIndex: largestDrop(curve)?.index,
  }));
  if (!sentences.length || !series.some((line) => line.points.size)) {
    return <p>Interest scores will appear here as sentences are scored.</p>;
  }

  const x = (position: number) => {
    const plotWidth = width - left - right;
    return left + (sentences.length === 1 ? plotWidth / 2 : (position * plotWidth) / (sentences.length - 1));
  };
  const tickSpacing = Math.ceil(sentences.length / 10);

  return (
    <figure>
      <svg role="img" aria-labelledby={titleId} viewBox={`0 0 ${width} ${height}`} style={{ width: "100%" }}>
        <title id={titleId}>Simulated audience interest by pitch sentence</title>
        {[1, 2, 3, 4, 5, 6, 7].map((level) => (
          <g key={level}>
            <line x1={left} x2={width - right} y1={y(level)} y2={y(level)} stroke="#d1d5db" />
            <text x={left - 12} y={y(level)} dominantBaseline="middle" textAnchor="end" fill="currentColor">
              {level}
            </text>
          </g>
        ))}
        {sentences.map(({ index }, position) => (
          position % tickSpacing === 0 || position === sentences.length - 1
            ? <text key={index} x={x(position)} y={height - 12} textAnchor="middle" fill="currentColor">
                {position + 1}
              </text>
            : null
        ))}
        {series.map((line, seriesIndex) => {
          const color = shades[seriesIndex % shades.length];
          return (
            <g key={line.label}>
              <path d={seriesPath(line, sentences, x)} fill="none" stroke={color} strokeWidth={2.5} />
              {sentences.map(({ index, text }, position) => {
                const score = line.points.get(index);
                if (score === undefined) return null;
                const drop = line.dropIndex === index;
                return (
                  <circle
                    key={index}
                    cx={x(position)}
                    cy={y(score)}
                    r={drop ? 6 : 3}
                    fill={drop ? "white" : color}
                    stroke={color}
                    strokeWidth={drop ? 3 : 1}
                  >
                    <title>{`${line.label}, sentence ${position + 1}, ${score.toFixed(1)} of 7${drop ? ", largest drop" : ""}. ${text}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
      <figcaption>
        Simulated interest on a 1–7 scale. Ring markers show the largest drop for each audience group.
      </figcaption>
      <ul aria-label="Audience groups">
        {series.map((line, index) => {
          const dropSentence = sentences.find((sentence) => sentence.index === line.dropIndex);
          return (
            <li key={line.label}>
              <span aria-hidden="true" style={{ color: shades[index % shades.length] }}>● </span>
              {line.label}
              {dropSentence && <> — largest drop at “{dropSentence.text}”</>}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
