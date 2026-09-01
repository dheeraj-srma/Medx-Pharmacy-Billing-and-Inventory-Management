import React from "react";
import { Activity } from "lucide-react";

interface ECGLoaderProps {
  size?: number;
  className?: string;
  text?: string;
  textClassName?: string;
  center?: boolean;
}

/**
 * ECGLoader: Medical heartbeat ECG pulsing loading indicator.
 * Displays the rhythmic Activity heartbeat icon without spinning,
 * mimicking a real hospital cardiac monitor pulse.
 */
export const ECGLoader: React.FC<ECGLoaderProps> = ({
  size = 24,
  className = "text-indigo-400",
  text,
  textClassName = "text-sm text-slate-400 font-medium",
  center = false,
}) => {
  const content = (
    <div className={`inline-flex items-center gap-2.5 ${center ? "justify-center" : ""}`}>
      <Activity size={size} className={`animate-ecg-pulse shrink-0 ${className}`} />
      {text && <span className={textClassName}>{text}</span>}
    </div>
  );

  if (center) {
    return (
      <div className="p-8 text-center flex items-center justify-center h-64 w-full">
        {content}
      </div>
    );
  }

  return content;
};

export default ECGLoader;
