"use client";

import Image from "next/image";
import { useState } from "react";

export default function SafeImage({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes="(min-width: 1024px) 560px, 100vw"
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}
