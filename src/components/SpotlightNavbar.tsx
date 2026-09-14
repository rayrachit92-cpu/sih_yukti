import React, { useEffect, useRef, useState } from 'react';
import { animate, motion } from 'framer-motion';
import { cn } from '../lib/utils';

export interface SpotlightNavItem {
  label: string;
  onClick: () => void;
}

interface SpotlightNavbarProps {
  items: SpotlightNavItem[];
  activeLabel: string;
  className?: string;
}

/** Premium floating navigation adapted for the 3D ULPIN workspace. */
export default function SpotlightNavbar({ items, activeLabel, className }: SpotlightNavbarProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const spotlightX = useRef(0);
  const ambienceX = useRef(0);
  const activeIndex = Math.max(0, items.findIndex(item => item.label === activeLabel));

  const moveToActive = () => {
    if (!navRef.current) return;
    const activeItem = navRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (!activeItem) return;
    const navRect = navRef.current.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    const targetX = itemRect.left - navRect.left + itemRect.width / 2;
    animate(spotlightX.current, targetX, {
      type: 'spring', stiffness: 240, damping: 24,
      onUpdate: v => {
        spotlightX.current = v;
        navRef.current?.style.setProperty('--spotlight-x', `${v}px`);
      },
    });
  };

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const handleMove = (e: MouseEvent) => {
      const rect = nav.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setHoverX(x);
      spotlightX.current = x;
      nav.style.setProperty('--spotlight-x', `${x}px`);
    };
    const handleLeave = () => {
      setHoverX(null);
      moveToActive();
    };
    nav.addEventListener('mousemove', handleMove);
    nav.addEventListener('mouseleave', handleLeave);
    requestAnimationFrame(moveToActive);
    window.addEventListener('resize', moveToActive);
    return () => {
      nav.removeEventListener('mousemove', handleMove);
      nav.removeEventListener('mouseleave', handleLeave);
      window.removeEventListener('resize', moveToActive);
    };
  }, [activeIndex, items.length]);

  useEffect(() => {
    if (!navRef.current) return;
    const activeItem = navRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (!activeItem) return;
    const navRect = navRef.current.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    const targetX = itemRect.left - navRect.left + itemRect.width / 2;
    animate(ambienceX.current, targetX, {
      type: 'spring', stiffness: 240, damping: 24,
      onUpdate: v => {
        ambienceX.current = v;
        navRef.current?.style.setProperty('--ambience-x', `${v}px`);
      },
    });
  }, [activeIndex]);

  return (
    <nav ref={navRef} className={cn('spotlight-nav', className)} aria-label="Primary navigation">
      <div className="spotlight-nav-ambient" aria-hidden />
      <div className="spotlight-nav-mouse" aria-hidden style={{ opacity: hoverX === null ? 0 : 1 }} />
      <div className="spotlight-nav-active" aria-hidden />
      <ul>
        {items.map((item, index) => (
          <li key={item.label}>
            <button
              type="button"
              data-index={index}
              onClick={item.onClick}
              className={cn('spotlight-nav-item', activeIndex === index && 'active')}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <motion.div className="spotlight-nav-sheen" aria-hidden animate={{ opacity: hoverX === null ? 0 : 1 }} />
    </nav>
  );
}
