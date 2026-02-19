export function showModal({ title, content, footerContent = '', confirmText = 'Confirm', cancelText = 'Cancel', confirmClasses = 'bg-red-600 hover:bg-red-700', onConfirm, onCancel, onAction, modalWidth = 'max-w-lg' }) {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;
    
    document.body.classList.add('modal-open');

    modalContainer.innerHTML = `
        <div id="custom-modal-backdrop" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-40"></div>
        <div id="custom-modal" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 w-full ${modalWidth} mx-auto p-6 flex flex-col">
            <h3 class="text-xl font-semibold mb-4 flex-shrink-0">${title}</h3>
            <div class="modal-content-area">${content}</div>
            <div class="mt-6 flex justify-between items-center flex-shrink-0">
                <div>${footerContent}</div>
                <div class="flex gap-4">
                    <button id="modal-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">${cancelText}</button>
                    ${confirmText ? `<button id="modal-confirm-btn" class="px-4 py-2 text-white rounded-lg ${confirmClasses}">${confirmText}</button>` : ''}
                </div>
            </div>
        </div>
    `;
    const closeModal = () => { 
        modalContainer.innerHTML = ''; 
        document.body.classList.remove('modal-open');
    };
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const backdrop = document.getElementById('custom-modal-backdrop');

    if (confirmBtn) {
        if (onAction) {
            confirmBtn.addEventListener('click', () => { onAction(closeModal); });
        } else {
            confirmBtn.addEventListener('click', async () => {
                let shouldClose = true;
                if (onConfirm) {
                    const result = await onConfirm(closeModal);
                    if (result === false) shouldClose = false;
                }
                if (shouldClose) closeModal();
            });
        }
    }
    if(cancelBtn) cancelBtn.addEventListener('click', () => { if (onCancel) onCancel(); closeModal(); });
    if(backdrop) backdrop.addEventListener('click', () => { if (onCancel) onCancel(); closeModal(); });

    return closeModal;
}

export function updateSaveStatus(message, type = 'success') {
    const statusEl = document.getElementById('saveStatus');
    const iconEl = document.getElementById('save-status-icon');
    if (!statusEl || !iconEl) return;

    statusEl.textContent = message;
    statusEl.className = 'text-sm';
    iconEl.className = 'save-status-icon';

    const typeClasses = { success: 'text-green-600', pending: 'text-yellow-600', error: 'text-red-500', saving: 'text-blue-600' };
    if(typeClasses[type]) {
        statusEl.classList.add(typeClasses[type]);
        iconEl.classList.add(typeClasses[type]);
    }

    const icons = {
        success: '&#10003;', // checkmark
        pending: '&#9203;',  // hourglass
        error:   '&#10007;', // X
        saving:  '&#8635;'   // spinning arrow
    };
    iconEl.innerHTML = icons[type] || '';

    // Add spin animation for saving
    if (type === 'saving') {
        iconEl.classList.add('animate-spin');
    } else {
        iconEl.classList.remove('animate-spin');
    }

    // Clear success message after a delay
    if (type === 'success') {
        setTimeout(() => { 
            if (statusEl.textContent === 'Synced!') {
                statusEl.textContent = ''; 
                iconEl.innerHTML = '';
            }
        }, 2000);
    }
}