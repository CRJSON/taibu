'use client';
import Image from 'next/image';

/** Shared artwork; orientation comes from the existing reading. */
export function TarotCardFace({ image, name, reversed = false }: { image: string; name: string; reversed?: boolean }) {
  return <Image src={image} alt={`${name}${reversed ? '（逆位）' : ''}`} fill sizes="(max-width: 640px) 112px, 160px" className={`object-cover ${reversed ? 'rotate-180' : ''}`} />;
}
