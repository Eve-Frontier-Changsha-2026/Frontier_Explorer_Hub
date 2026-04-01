"use client";

interface RatingStarsProps {
  rating: number; // 0-5
  trades: number;
  size?: "sm" | "md";
}

export function RatingStars({ rating, trades, size = "sm" }: RatingStarsProps) {
  const display = trades === 0 ? 3.0 : rating;
  const textSize = size === "sm" ? "text-[0.6rem]" : "text-xs";
  return (
    <span className={`${textSize} text-eve-muted`}>
      ★ {display.toFixed(1)} ({trades} trade{trades !== 1 ? "s" : ""})
    </span>
  );
}
