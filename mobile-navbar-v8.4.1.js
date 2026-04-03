/* ============================================================================
   MOBILE NAVBAR v8.0.3-1
   Bottom Navigation Controller for Mobile
   Created: 2026-01-23
============================================================================ */

class MobileNavbar {
    constructor(navbarId) {
        this.navbar = document.getElementById(navbarId);
        // Thay vì search ta không còn search trên nav bar, set filter làm view mặc định hoặc bỏ null
        this.currentView = null;
        this.badges = {
            search: 0,
            location: 0,
            checkin: 0,
            inventory: 0,
            tools: 0
        };

        this.init();
    }

    init() {
        if (!this.navbar) {
            console.error('Mobile navbar not found');
            return;
        }

        // Attach click handlers to nav items
        const navItems = this.navbar.querySelectorAll('.mobile-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const navType = item.dataset.nav;
                this.setActive(navType);
            });
        });

        // Set initial active
        this.setActive(this.currentView);
    }

    /**
     * Set active navigation item
     */
    setActive(navType) {
        this.currentView = navType;

        // Update visual states
        const navItems = this.navbar.querySelectorAll('.mobile-nav-item');
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.nav === navType);
        });

        // Dispatch event for other modules
        const event = new CustomEvent('mobile-nav-change', {
            detail: { view: navType }
        });
        document.dispatchEvent(event);

        // Handle navigation
        this.handleNavigation(navType);
    }

    handleNavigation(navType) {
        switch(navType) {
            case 'filter':
                const filterContent = document.getElementById('filterContent');
                if (filterContent && filterContent.classList.contains('expanded')) {
                     const filterBtn = document.getElementById('filterDetailBtn');
                     if(filterBtn) filterBtn.click();
                } else {
                     const filterBtn = document.getElementById('filterDetailBtn');
                     if(filterBtn) filterBtn.click();
                }
                break;
            case 'qrscan':
                if (window.ScanSearchModule && typeof window.ScanSearchModule.openModal === 'function') {
                    window.ScanSearchModule.openModal();
                }
                this.setActive(null);
                break;
            case 'photos':
                if (window.PhotoManager && typeof window.PhotoManager.open === 'function') {
                    window.PhotoManager.open();
                }
                break;
            case 'camera':
                if (window.PhotoUpload && typeof window.PhotoUpload.open === 'function') {
                    window.PhotoUpload.open({mode: 'standalone'});
                }
                break;
            case 'menu':
                this.showToolsView();
                break;
        }
    }

    /**
     * Show tools view (open sidebar)
     */
    showToolsView() {
        console.log('Navigated to: Menu - Toggling Sidebar manually');
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('open');
        }
    }

    /**
     * Update badge count
     */
    updateBadge(navType, count) {
        this.badges[navType] = count;

        const navItem = this.navbar.querySelector(`[data-nav="${navType}"]`);
        if (!navItem) return;

        let badge = navItem.querySelector('.mobile-nav-badge');

        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'mobile-nav-badge';
                navItem.appendChild(badge);
            }
            badge.textContent = count > 99 ? '99+' : count;

            // Add "new" class for animation on first update
            if (count > this.badges[navType]) {
                badge.classList.add('new');
                setTimeout(() => badge.classList.remove('new'), 1000);
            }
        } else {
            if (badge) {
                badge.remove();
            }
        }
    }

    /**
     * Update all badges
     */
    updateAllBadges(badgeData) {
        Object.keys(badgeData).forEach(navType => {
            this.updateBadge(navType, badgeData[navType]);
        });
    }

    /**
     * Get current active view
     */
    getCurrentView() {
        return this.currentView;
    }

    /**
     * Show/hide navbar
     */
    show() {
        if (this.navbar) {
            this.navbar.style.display = 'block';
        }
    }

    hide() {
        if (this.navbar) {
            this.navbar.style.display = 'none';
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.MobileNavbar = MobileNavbar;
}
