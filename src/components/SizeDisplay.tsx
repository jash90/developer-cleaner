import { formatSize } from '../utils/formatSize';

interface SizeDisplayProps {
  bytes: number;
  className?: string;
}

/**
 * Sizes are data, not warnings: they stay neutral so that red keeps its one meaning in this
 * app, uncommitted work that a removal would lose.
 */
export function SizeDisplay({ bytes, className = '' }: SizeDisplayProps) {
  return (
    <span className={`text-gray-900 tabular-nums ${className}`}>
      {formatSize(bytes)}
    </span>
  );
}
