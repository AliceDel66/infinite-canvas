type BrandMarkProps = {
    className?: string;
    title?: string;
};

export function BrandMark({ className, title }: BrandMarkProps) {
    return (
        <svg className={className} viewBox="0 0 64 64" fill="none" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
            {title ? <title>{title}</title> : null}
            <path d="M8 14h14l34 36H42L8 14Z" fill="#ff5d4a" />
            <path d="M42 14h14L22 50H8l34-36Z" fill="#20aa9a" />
            <path d="m25.4 32 7-7.4 7.1 7.5-7 7.4-7.1-7.5Z" fill="#1f2937" />
        </svg>
    );
}
