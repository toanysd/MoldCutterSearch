// v9.0.2
(function() {
    console.log('[PullToRefresh] Initializing v8.5.11 - Optimizing Swipe Focus Mobile...');
    let startY = 0;
    let isPulling = false;
    let shouldRefresh = false;
    const threshold = 80; // Vuốt nhẹ hơn một chút (80px)

    const bindTouchEvents = () => {
        const container = document.querySelector('.results-container');
        if(!container) {
            setTimeout(bindTouchEvents, 500);
            return;
        }

        // Bắt đầu vuốt từ vị trí trên cùng
        container.addEventListener('touchstart', (e) => {
            if (container.scrollTop <= 0) { 
                startY = e.touches[0].clientY;
                isPulling = true;
                shouldRefresh = false;
            }
        }, {passive: true});

        // Di chuyển ngón tay
        container.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            const currentY = e.touches[0].clientY;
            const diff = currentY - startY;

            if (diff > threshold) {
                shouldRefresh = true;
            } else {
                shouldRefresh = false;
            }
        }, {passive: true});

        // Nhả ngón tay -> Quyết định có Refresh + Auto Focus không
        container.addEventListener('touchend', () => {
            if (isPulling && shouldRefresh) {
                console.log('[PullToRefresh] Kích hoạt Xóa Text & Mở Bàn Phím Ảo!');
                
                // 1. Dọn trống ô text
                const searchInput = document.getElementById('searchInput');
                if(searchInput) searchInput.value = '';
                
                // 2. Ép Trigger nút Xóa
                const clearBtn = document.querySelector('.clear-btn');
                if(clearBtn) {
                   clearBtn.click();
                }

                // 3. Mở bàn phím ảo (ưu tiên trên Mobile) thay vì focus native
                if (window.VirtualKeyboardModule && typeof window.VirtualKeyboardModule.open === 'function') {
                    setTimeout(function() {
                        window.VirtualKeyboardModule.open(searchInput);
                    }, 100); // Chờ clear xong rồi mở VK
                }
            }
            isPulling = false;
            shouldRefresh = false;
        });
    };

    // Bắt đầu chờ DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindTouchEvents);
    } else {
        bindTouchEvents();
    }
})();
