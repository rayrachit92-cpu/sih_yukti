import React from 'react';
import { motion, type MotionProps } from 'framer-motion';
import { cn } from '../lib/utils';

type AnimatedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & MotionProps & {
  children?: React.ReactNode;
  as?: 'button' | 'a';
};

/** Premium theme-aware action button with a subtle text and border shine. */
export default function AnimatedButton({
  children = 'Browse Components',
  className = '',
  as = 'button',
  type = 'button',
  ...rest
}: AnimatedButtonProps) {
  const Component = as === 'a' ? motion.a : motion.button;

  return (
    <Component
      {...(rest as any)}
      {...(as === 'button' ? { type } : {})}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }}
      className={cn(
        'animated-button group inline-flex items-center justify-center px-6 py-2 rounded-md relative overflow-hidden',
        className,
      )}
    >
      <motion.span
        className="animated-button-text tracking-wide font-light flex items-center justify-center h-full w-full relative z-10"
        style={{
          WebkitMaskImage: 'linear-gradient(-75deg, white calc(var(--mask-x) + 20%), transparent calc(var(--mask-x) + 30%), white calc(var(--mask-x) + 100%))',
          maskImage: 'linear-gradient(-75deg, white calc(var(--mask-x) + 20%), transparent calc(var(--mask-x) + 30%), white calc(var(--mask-x) + 100%))',
        }}
        initial={{ '--mask-x': '100%' } as any}
        animate={{ '--mask-x': '-100%' } as any}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear', repeatDelay: 1 }}
      >
        {children}
      </motion.span>
      <motion.span
        aria-hidden="true"
        className="block absolute inset-0 rounded-md p-px pointer-events-none"
        style={{
          background: 'linear-gradient(-75deg, transparent 30%, var(--shine) 50%, transparent 70%)',
          backgroundSize: '200% 100%',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
        }}
        initial={{ backgroundPosition: '100% 0', opacity: 0 }}
        animate={{ backgroundPosition: ['100% 0', '0% 0'], opacity: [0, 1, 0] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
      />
    </Component>
  );
}
