// v9.0.5
/**

 * Bàn phím Ảo (Virtual Keyboard Module)

 * Dành riêng cho Mobile để tối ưu nhập liệu Mã Khuôn.

 */



(function (global) {

    'use strict';



    var VirtualKeyboard = function () {

        this.isOpen = false;

        this.currentText = "";

        this.targetInput = null;

        this.layout = 'alpha'; // 'alpha' | 'numeric'



        // Tọa độ bắt đầu vuốt Radial

        this.touchStartX = 0;

        this.touchStartY = 0;

        this.isRadialActive = false;

    };



    VirtualKeyboard.prototype.init = function () {

        this._injectHTML();

        this._cacheDOM();

        this._bindEvents();

        this._buildQwerty();

        this._buildNumeric();

        this._bindRadial();



        // Bắt sự kiện click bên ngoài để tự động đóng bàn phím

        var self = this;

        var outsideClose = function (e) {

            if (self.isOpen && self.el.container) {

                // Nếu không click vào vùng bàn phím, không click vào khung search, không click vào nút QR Radial

                var isInsideVK = self.el.container.contains(e.target);

                var isSearchBox = e.target.id === 'searchInput' || e.target.closest('.search-box-container') || e.target.closest('.d-search-box');

                var isQRRadial = e.target.closest('.qr-nav-btn') || e.target.closest('#vkRadialOverlay');



                if (!isInsideVK && !isSearchBox && !isQRRadial) {

                    self.close();

                }

            }

        };

        document.addEventListener('touchstart', outsideClose, { passive: true });

        document.addEventListener('mousedown', outsideClose);

    };



    VirtualKeyboard.prototype._injectHTML = function () {

        var check = document.getElementById('vKeyboardContainer');

        if (check) return; // already injected



        var html = `

      <div id="vKeyboardContainer">

        <div class="vk-top-bar">

          <div class="vk-preview-input" id="vkPreviewInput">

            <span id="vkTextBody"></span><span class="vk-preview-cursor"></span>

          </div>

          <button type="button" class="vk-icon-btn" id="vkClearBtn" title="クリア / Xóa hết" style="margin-left:8px; background:none; border:none; color:#ef4444; font-size:18px; cursor:pointer; padding:4px 8px;"><i class="fas fa-times-circle"></i></button>

          <button type="button" class="vk-close-btn" id="vkCloseBtn">閉じる</button>

        </div>

        

        <div class="vk-wizard-bar" id="vkWizardBar">

          <!-- Gợi ý tự động (MDS-, YSD-) inject vào đây -->

        </div>



        <div class="vk-keypad-wrapper">

          <!-- Layout Chữ (A-Z) -->

          <div id="vkAlphaLayout" class="vk-layout vk-visible"></div>

          

          <!-- Layout Số (0-9) -->

          <div id="vkNumericLayout" class="vk-layout"></div>

        </div>

      </div>



      <div id="vkRadialOverlay">

        <div class="vk-radial-menu" id="vkRadialMenu">

          <div class="vk-radial-item" data-action="search" id="vkRadialItemSearch">

            <i class="fas fa-keyboard vk-radial-icon"></i>

            <span class="vk-radial-lbl">検索</span>

          </div>

          <div class="vk-radial-item" data-action="photo" id="vkRadialItemPhoto">

            <i class="fas fa-camera vk-radial-icon"></i>

            <span class="vk-radial-lbl">写真</span>

          </div>

        </div>

      </div>

    `;

        var wrapper = document.createElement('div');

        wrapper.innerHTML = html;

        document.body.appendChild(wrapper);

    };



    VirtualKeyboard.prototype._cacheDOM = function () {

        this.el = {

            container: document.getElementById('vKeyboardContainer'),

            previewInput: document.getElementById('vkPreviewInput'),

            textBody: document.getElementById('vkTextBody'),

            clearBtn: document.getElementById('vkClearBtn'),

            closeBtn: document.getElementById('vkCloseBtn'),

            wizardBar: document.getElementById('vkWizardBar'),

            alpha: document.getElementById('vkAlphaLayout'),

            numeric: document.getElementById('vkNumericLayout'),



            radialOverlay: document.getElementById('vkRadialOverlay'),

            radialMenu: document.getElementById('vkRadialMenu'),

            radialSearch: document.getElementById('vkRadialItemSearch'),

            radialPhoto: document.getElementById('vkRadialItemPhoto')

        };

    };



    VirtualKeyboard.prototype._buildQwerty = function () {

        var rawText = `

      Q W E R T Y U I O P

      A S D F G H J K L

      Z X C V B N M -

    `;

        var lines = rawText.trim().split('\n').filter(l => l.trim().length > 0);
        var html = '';



        // Dòng 1

        html += '<div class="vk-row">';

        lines[0].trim().split(' ').forEach(char => {

            html += '<div class="vk-key" data-val="' + char + '">' + char + '</div>';

        });

        html += '</div>';



        // Dòng 2

        html += '<div class="vk-row">';

        lines[1].trim().split(' ').forEach(char => {

            html += '<div class="vk-key" data-val="' + char + '">' + char + '</div>';

        });

        html += '</div>';



        // Dòng 3

        html += '<div class="vk-row">';

        html += '<div class="vk-key vk-special vk-wide" data-action="switch">123</div>';

        lines[2].trim().split(' ').forEach(char => {

            html += '<div class="vk-key" data-val="' + char + '">' + char + '</div>';

        });

        html += '<div class="vk-key vk-special" data-action="backspace"><i class="fas fa-backspace"></i></div>';

        html += '</div>';



        // Dòng 4 (Space & Enter)

        html += '<div class="vk-row">';

        html += '<div class="vk-key vk-special" data-action="use_native" id="vkUseNativeBtn" style="flex: 0.8; font-size: 18px;" title="端末キーボード"><i class="fas fa-keyboard"></i></div>';

        html += '<div class="vk-key vk-wide" data-val=" ">SPACE</div>';

        html += '<div class="vk-key vk-primary vk-wide" data-action="enter"><i class="fas fa-search"></i> 検索</div>';

        html += '</div>';



        this.el.alpha.innerHTML = html;

    };



    VirtualKeyboard.prototype._buildNumeric = function () {

        var rawText = `

      1 2 3

      4 5 6

      7 8 9

      . 0 -

    `;

        var lines = rawText.trim().split('\n').filter(l => l.trim().length > 0);
        var html = '';



        lines.forEach((line, idx) => {

            html += '<div class="vk-row">';

            line.trim().split(' ').forEach(char => {

                html += '<div class="vk-key" data-val="' + char + '">' + char + '</div>';

            });

            // Thêm nút phụ bên phải cho dòng đặc biệt

            if (idx === 0) html += '<div class="vk-key vk-special" data-action="backspace"><i class="fas fa-backspace"></i></div>';

            else if (idx === 1) html += '<div class="vk-key vk-special" data-action="clear">クリア</div>';

            else if (idx === 2) html += '<div class="vk-key vk-special" data-action="switch" style="font-size: 14px;">ABC</div>';

            else if (idx === 3) html += '<div class="vk-key vk-primary" data-action="enter"><i class="fas fa-search"></i></div>';

            html += '</div>';

        });



        this.el.numeric.innerHTML = html;

    };



    VirtualKeyboard.prototype._bindEvents = function () {

        var self = this;



        this.el.closeBtn.addEventListener('click', function () {

            self.close();

        });



        if (this.el.clearBtn) {

            this.el.clearBtn.addEventListener('click', function () {

                self.currentText = '';

                self._updateDisplay();

                if (self.targetInput) {

                    self.targetInput.value = '';

                    var dEvent = new Event('input', { bubbles: true });

                    self.targetInput.dispatchEvent(dEvent);

                }

            });

        }



        // Bắt phím

        var onKeyClick = function (e) {

            // Find closest .vk-key

            var key = e.target.closest('.vk-key');

            if (!key) return;



            var val = key.dataset.val;

            var action = key.dataset.action;



            if (val !== undefined) {

                self._append(val);

            } else if (action === 'backspace') {

                self._backspace();

            } else if (action === 'clear') {

                self.currentText = '';

                self._updateDisplay();

            } else if (action === 'switch') {

                self._switchLayout();

            } else if (action === 'enter') {

                self._submit();

            } else if (action === 'use_native') {

                self.close();

                if (self.targetInput) {

                    self.targetInput.readOnly = false;

                    self.targetInput.focus();

                }

            }

        };



        // Chuẩn hóa touch / click (dùng mousedown để không trùng touch)

        if ('ontouchstart' in window) {

            this.el.container.addEventListener('touchstart', function (e) {

                var key = e.target.closest('.vk-key');

                if (key) {

                    key.classList.add('active'); // active feedback

                }

            });

            this.el.container.addEventListener('touchend', function (e) {

                var key = e.target.closest('.vk-key');

                if (key) {

                    key.classList.remove('active');

                    if (e.cancelable) {

                        e.preventDefault(); // chặn click double

                    }

                }

                onKeyClick(e);

            });

        } else {

            this.el.container.addEventListener('click', onKeyClick);

        }



        // Swipe to close functionality (下/左/右 vuốt để đóng bàn phím)

        var vkStartX = 0;

        var vkStartY = 0;

        var isSwipingVK = false;



        this.el.container.addEventListener('touchstart', function (e) {

            // Chỉ swipe khi chạm từ vùng không phải nút

            if (e.target.closest('.vk-key') || e.target.closest('.vk-wizard-item')) return;

            vkStartX = e.touches[0].clientX;

            vkStartY = e.touches[0].clientY;

            isSwipingVK = true;

        }, { passive: true });



        this.el.container.addEventListener('touchmove', function (e) {

            if (!isSwipingVK) return;

            var currentX = e.touches[0].clientX;

            var currentY = e.touches[0].clientY;

            var deltaX = currentX - vkStartX;

            var deltaY = currentY - vkStartY;



            // Vuốt xuống (>40px) → Đóng

            if (deltaY > 40) {

                self.close();

                isSwipingVK = false;

                return;

            }

            // Vuốt sang trái hoặc phải (>60px) → Đóng

            if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 30) {

                self.close();

                isSwipingVK = false;

                return;

            }

        }, { passive: true });



        this.el.container.addEventListener('touchend', function (e) {

            isSwipingVK = false;

        });



        // Nút mở đã được xử lý chung trong onKeyClick



        // Đóng bàn phím khi click / touch ra ngoài khu vực bàn phím và ô input

        var closeIfOutside = function (e) {

            if (!self.isOpen) return;

            if (e.target.closest('#vKeyboardContainer')) return;

            if (self.targetInput && e.target === self.targetInput) return;

            // Nếu bấm vào các nút điều khiển bên trên (VD nút clear, filter tag) cũng không nên chặn close, nên tự động đóng.

            self.close();

        };

        document.addEventListener('mousedown', closeIfOutside);

        document.addEventListener('touchstart', closeIfOutside, { passive: true });



        // Ảo hóa Native Input

        this.nativeInput = document.getElementById('searchInput');

    };



    VirtualKeyboard.prototype._bindRadial = function () {

        var self = this;

        var qrBtn = document.querySelector('.qr-nav-btn');

        if (!qrBtn) return;



        var overlay = this.el.radialOverlay;

        var menu = this.el.radialMenu;

        var timer = null;



        var showRadial = function (x, y) {

            self.isRadialActive = true;

            overlay.style.display = 'block';

            // Center menu exactly around the tap location

            menu.style.left = x + 'px';

            menu.style.top = y + 'px';



            // Pos các item (rẽ quạt lên)

            // Tìm kiếm (Trái/Trên)

            self.el.radialSearch.style.left = '-60px';

            self.el.radialSearch.style.top = '-60px';

            self.el.radialSearch.classList.add('show');



            // Ảnh (Phải/Trên)

            self.el.radialPhoto.style.left = '60px';

            self.el.radialPhoto.style.top = '-60px';

            self.el.radialPhoto.classList.add('show');

        };



        var hideRadial = function () {

            self.isRadialActive = false;

            overlay.style.display = 'none';

            self.el.radialSearch.classList.remove('show', 'active');

            self.el.radialPhoto.classList.remove('show', 'active');

        };



        var isSwipingQR = false;



        qrBtn.addEventListener('touchstart', function (e) {

            e.preventDefault(); // ★ Chặn text-selection khi touch

            var touch = e.touches[0];

            self.touchStartX = touch.clientX;

            self.touchStartY = touch.clientY;

            isSwipingQR = true;

            // Không hẹn giờ nữa, vuốt là hiện luôn

        });



        qrBtn.addEventListener('touchmove', function (e) {

            if (!isSwipingQR) return;

            e.preventDefault(); // chặn kéo trang



            var t = e.touches[0];

            var dx = t.clientX - self.touchStartX;

            var dy = t.clientY - self.touchStartY;



            // Kích hoạt ngay khi vuốt vượt 10px

            if (!self.isRadialActive && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {

                showRadial(self.touchStartX, self.touchStartY);

                if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) {

                    try { navigator.vibrate(30); } catch (e) { } // Rung nhẹ báo hiệu bung menu

                }

            }



            if (self.isRadialActive) {

                // Reset hover

                self.el.radialSearch.classList.remove('active');

                self.el.radialPhoto.classList.remove('active');



                // Vuốt chéo trái hoặc vuốt ngang trái -> Tìm kiếm

                if ((dy < -20 && dx < -10) || dx < -30) {

                    self.el.radialSearch.classList.add('active');

                } 

                // Vuốt chéo phải hoặc vuốt ngang phải -> Chụp ảnh

                else if ((dy < -20 && dx > 10) || dx > 30) {

                    self.el.radialPhoto.classList.add('active');

                }

            }

        }, { passive: false });



        qrBtn.addEventListener('touchend', function (e) {

            isSwipingQR = false;

            

            if (!self.isRadialActive) {

                // Nếu chưa thành swipe, nghĩa là chỉ chạm (tap) -> Mở Scan QR mặc định

                if (window.QRScannerModule && typeof window.QRScannerModule.open === 'function') {

                    window.QRScannerModule.open();

                }

                return;

            }



            // Thực thi hành động đã chọn

            if (self.el.radialSearch.classList.contains('active')) {

                hideRadial();

                self.open(self.nativeInput);

            } else if (self.el.radialPhoto.classList.contains('active')) {

                hideRadial();

                if (window.PhotoUpload) window.PhotoUpload.open();

            } else {

                hideRadial(); // Đóng nếu thả tay ở khoảnh không gian trống

            }

        });

    };



    VirtualKeyboard.prototype._append = function (char) {

        this.currentText += char;

        this._updateDisplay();

        this._updateWizard();

    };



    VirtualKeyboard.prototype._backspace = function () {

        this.currentText = this.currentText.slice(0, -1);

        this._updateDisplay();

        this._updateWizard();

    };



    VirtualKeyboard.prototype._updateDisplay = function () {

        this.el.textBody.innerText = this.currentText;

        if (this.targetInput) {

            this.targetInput.value = this.currentText;

            // Trigger native input event để search module phản ứng

            var evt = new Event('input', { bubbles: true });

            this.targetInput.dispatchEvent(evt);

        }

    };



    VirtualKeyboard.prototype._switchLayout = function (forceLayout) {

        if (forceLayout) this.layout = forceLayout;

        else this.layout = this.layout === 'alpha' ? 'numeric' : 'alpha';



        if (this.layout === 'alpha') {

            this.el.alpha.classList.add('vk-visible');

            this.el.numeric.classList.remove('vk-visible');

        } else {

            this.el.alpha.classList.remove('vk-visible');

            this.el.numeric.classList.add('vk-visible');

        }

    };



    VirtualKeyboard.prototype._updateWizard = function () {

        var self = this;

        var query = this.currentText.toUpperCase();

        this.el.wizardBar.innerHTML = '';



        if (query.length === 0) {

            if (this.layout !== 'alpha') this._switchLayout('alpha');

            return;

        }



        // Scan DataManager for prefixes

        var prefixes = new Set();

        if (window.DataManager && typeof window.DataManager.getAllItems === 'function') {

            var arr = window.DataManager.getAllItems() || [];

            for (var i = 0; i < arr.length; i++) {

                var code = (arr[i].MoldCode || '').toUpperCase();

                if (code.indexOf(query) === 0) { // starts with

                    // Extract prefix parts (VD: MDS-0010 -> MDS-)

                    var match = code.match(/^[A-Z\-]+/);

                    if (match) prefixes.add(match[0]);

                }

            }

        }



        var prefixArray = Array.from(prefixes);



        // --- Logic Thông minh: Tự động chuyển layout ---

        if (prefixArray.length > 0) {

            var hasExactMatch = prefixArray.indexOf(query) !== -1;

            var hasLongerMatch = prefixArray.some(function (p) {

                return p.length > query.length && p.indexOf(query) === 0;

            });



            if (hasExactMatch && !hasLongerMatch) {

                // Khớp hoàn toàn duy nhất -> Chuyển sang số

                if (this.layout !== 'numeric') this._switchLayout('numeric');

            } else if (!hasExactMatch && hasLongerMatch) {

                // Đang gõ dở chữ -> Chuyển về chữ

                if (this.layout !== 'alpha' && !/\d/.test(query)) this._switchLayout('alpha');

            }

        }



        // Ưu tiên hiện số nếu query có chứa số

        if (/\d/.test(query) && this.layout !== 'numeric') {

            this._switchLayout('numeric');

        }

        // ------------------------------------------------



        var list = prefixArray.slice(0, 5); // limit 5

        if (list.length === 0) {

            // Defaults fallbacks

            if ("MDS-".indexOf(query) === 0) list.push("MDS-");

            if ("YSD-".indexOf(query) === 0) list.push("YSD-");

        }



        list.forEach(function (pref) {

            var d = document.createElement('div');

            d.className = 'vk-wizard-item';

            d.innerText = pref;

            // Mouse down for immediate reaction

            d.onmousedown = d.ontouchstart = function (e) {

                e.preventDefault();

                self.currentText = pref;

                self._updateDisplay();

                // Automatically switch to numeric pad!

                self._switchLayout('numeric');

            };

            self.el.wizardBar.appendChild(d);

        });

    };



    VirtualKeyboard.prototype._submit = function () {
        console.log('[VirtualKeyboard] _submit() started. currentText:', this.currentText, 'targetInput ID:', this.targetInput ? this.targetInput.id : 'none');
        this.close();

        var mainSearchInput = document.getElementById('searchInput');

        // Bất kể đang ở module nào (Tray, History), khi bấm Search -> ép về giao diện chính
        console.log('[VirtualKeyboard] Calling ViewManager.switchView("mold")');
        if (window.ViewManager && typeof window.ViewManager.switchView === 'function') {
            window.ViewManager.switchView('mold');
            
            // Cập nhật giao diện Mobile Nav
            var navBtns = document.querySelectorAll('.mobile-nav-btn');
            if (navBtns) navBtns.forEach(btn => btn.classList.remove('active'));
            var moldBtn = document.getElementById('mobileNavMoldsBtn');
            if (moldBtn) moldBtn.classList.add('active');
        }

        // Đảm bảo Filter category là 'all' hoặc 'mold' thay vì bị kẹt ở 'tray'
        if (window.app) {
            if (window.app.selectedCategory === 'tray' || window.app.selectedCategory === 'history') {
                window.app.selectedCategory = 'all';
                var catDropdown = document.getElementById('categoryDropdown');
                if (catDropdown) catDropdown.value = 'all';
            }
        }

        if (mainSearchInput) {
            mainSearchInput.value = this.currentText;

            // Đóng tất cả các modal đang mở
            if (window.PhotoUpload && typeof window.PhotoUpload.close === 'function') window.PhotoUpload.close();
            if (window.SACTModule && typeof window.SACTModule.close === 'function') window.SACTModule.close();
            if (window.LocationMoveModule && typeof window.LocationMoveModule.close === 'function') window.LocationMoveModule.close();
            if (window.PhotoManagerModule && typeof window.PhotoManagerModule.close === 'function') window.PhotoManagerModule.close();

            var detailPanel = document.getElementById('detailPanel');
            if (detailPanel && detailPanel.classList.contains('open')) {
                detailPanel.classList.remove('open', 'active');
                var backdrop = document.getElementById('backdrop');
                if (backdrop) backdrop.classList.remove('show');
            }

            // Gọi trực tiếp search module với addToHistory=true (explicit submit)
            console.log('[VirtualKeyboard] Triggering app.searchModule.performSearch(true)');
            if (window.app && window.app.searchModule && typeof window.app.searchModule.performSearch === 'function') {
                window.app.searchModule.performSearch(true);
            } else {
                document.dispatchEvent(new CustomEvent('searchPerformed', { detail: { query: this.currentText, timestamp: Date.now() } }));
            }
        } else if (this.targetInput) {
            console.log('[VirtualKeyboard] Triggering fallback performSearch(true)');
            if (window.app && window.app.searchModule && typeof window.app.searchModule.performSearch === 'function') {
                window.app.searchModule.performSearch(true);
            } else {
                document.dispatchEvent(new CustomEvent('searchPerformed', { detail: { query: this.currentText, timestamp: Date.now() } }));
            }
        }
    };



    VirtualKeyboard.prototype.open = function (inputEl) {
        this.targetInput = inputEl;
        if (inputEl) {
            this.currentText = inputEl.value || '';
            // ★ QUAN TRỌNG: Đuổi bàn phím gốc (iOS/Android) đi để tránh lỗi chớp giật Viewport
            inputEl.readOnly = true; 
            inputEl.blur();          
            this._updateDisplay();
        }

        // Mặc định bàn phím hiển thị dạng ABC
        this._switchLayout('alpha');

        // Gợi ý wizard
        this._updateWizard();
        this.isOpen = true;
        this.el.container.classList.add('vk-active');
    };

    VirtualKeyboard.prototype.close = function () {
        this.isOpen = false;
        this.el.container.classList.remove('vk-active');
        // Phục hồi lại Native Input sau khi đóng
        if (this.targetInput) {
            this.targetInput.readOnly = false;
        }
    };



    // Expose

    global.VirtualKeyboardModule = new VirtualKeyboard();



    // Boot

    if (document.readyState === 'loading') {

        document.addEventListener('DOMContentLoaded', function () { global.VirtualKeyboardModule.init(); });

    } else {

        setTimeout(function () { global.VirtualKeyboardModule.init(); }, 0);

    }



})(window);

