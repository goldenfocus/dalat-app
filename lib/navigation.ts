export const MAIN_NAV_ITEMS = [
    { href: '/', label: 'Home', icon: 'Map' as const },
    { href: '/events', label: 'All events', icon: 'Calendar' as const },
    { href: '/organizers', label: 'Organizers', icon: 'Users' as const },
    { href: '/guide', label: 'Guide', icon: 'Book' as const },
] as const;

export const BOTTOM_NAV_ITEMS = [
    { href: '/', label: 'Home', icon: 'Home' as const },
    { href: '/events', label: 'Events', icon: 'Calendar' as const },
    { href: '/organizers', label: 'Organizers', icon: 'Users' as const },
    { href: '/guide', label: 'Guide', icon: 'Book' as const },
    { href: '/settings', label: 'Profile', icon: 'User' as const },
] as const;
