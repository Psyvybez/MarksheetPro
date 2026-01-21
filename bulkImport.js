import { showModal } from './ui.js';
import { getActiveClassData } from './state.js';
import { triggerAutoSave } from './main.js';
import { renderGradebook } from './render.js';

// Set up PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export async function openBulkImportModal() {
    const modalContent = `
        <div class="space-y-4">
            <div class="flex gap-4 mb-4">
                <button id="paste-tab-btn" class="tab-button px-4 py-2 border-b-2 border-blue-500 font-semibold text-blue-600">
                    Paste Text
                </button>
                <button id="upload-tab-btn" class="tab-button px-4 py-2 border-b-2 border-gray-300 font-semibold text-gray-600 hover:text-blue-600">
                    Upload File
                </button>
            </div>

            <!-- Paste Tab -->
            <div id="paste-tab" class="space-y-4">
                <div>
                    <label for="format-selector" class="block text-sm font-medium mb-2">Name Format</label>
                    <select id="format-selector" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        <option value="one-per-line">One name per line (First Last)</option>
                        <option value="one-per-line-reversed">One name per line (Last, First)</option>
                        <option value="comma-separated">Comma separated (First Last)</option>
                        <option value="comma-separated-reversed">Comma separated (Last, First)</option>
                        <option value="custom">Custom - I'll map it</option>
                    </select>
                </div>
                <div>
                    <label for="paste-input" class="block text-sm font-medium mb-2">Paste Names Here</label>
                    <textarea id="paste-input" class="w-full h-48 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm" placeholder="Paste a list of names here...&#10;John Smith&#10;Jane Doe&#10;..."></textarea>
                </div>
            </div>

            <!-- Upload Tab -->
            <div id="upload-tab" class="space-y-4 hidden">
                <div>
                    <label for="file-input" class="block text-sm font-medium mb-2">Upload PDF or Image</label>
                    <input type="file" id="file-input" accept=".pdf,.png,.jpg,.jpeg,.gif" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                </div>
                <div id="ocr-status" class="hidden p-3 bg-blue-50 text-blue-700 rounded-md">
                    <p class="text-sm">Processing file with OCR... <span class="animate-spin inline-block">⟳</span></p>
                </div>
                <div id="extraction-result" class="hidden space-y-2">
                    <p class="text-sm font-medium">Extracted Text:</p>
                    <textarea id="extracted-text" class="w-full h-32 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm" readonly></textarea>
                    <div>
                        <label for="upload-format-selector" class="block text-sm font-medium mb-2">Name Format</label>
                        <select id="upload-format-selector" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                            <option value="one-per-line">One name per line (First Last)</option>
                            <option value="one-per-line-reversed">One name per line (Last, First)</option>
                            <option value="comma-separated">Comma separated (First Last)</option>
                            <option value="comma-separated-reversed">Comma separated (Last, First)</option>
                            <option value="custom">Custom - I'll map it</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;

    showModal({
        title: 'Bulk Import Students',
        content: modalContent,
        modalWidth: 'max-w-2xl',
        confirmText: 'Parse & Preview',
        confirmClasses: 'bg-primary hover:bg-primary-dark',
        onConfirm: async () => {
            const activeTab = document.getElementById('paste-tab').classList.contains('hidden') ? 'upload' : 'paste';
            
            let extractedText = '';
            let format = '';

            if (activeTab === 'paste') {
                extractedText = document.getElementById('paste-input').value.trim();
                format = document.getElementById('format-selector').value;
            } else {
                extractedText = document.getElementById('extracted-text').value.trim();
                format = document.getElementById('upload-format-selector').value;
            }

            if (!extractedText) {
                alert('Please provide names to import.');
                return;
            }

            // Parse names and open preview modal
            await openNameMappingModal(extractedText, format);
        }
    });

    // Tab switching
    const pasteTabBtn = document.getElementById('paste-tab-btn');
    const uploadTabBtn = document.getElementById('upload-tab-btn');
    const pasteTab = document.getElementById('paste-tab');
    const uploadTab = document.getElementById('upload-tab');

    pasteTabBtn.addEventListener('click', () => {
        pasteTab.classList.remove('hidden');
        uploadTab.classList.add('hidden');
        pasteTabBtn.classList.add('border-blue-500', 'text-blue-600');
        pasteTabBtn.classList.remove('border-gray-300', 'text-gray-600');
        uploadTabBtn.classList.remove('border-blue-500', 'text-blue-600');
        uploadTabBtn.classList.add('border-gray-300', 'text-gray-600');
    });

    uploadTabBtn.addEventListener('click', () => {
        uploadTab.classList.remove('hidden');
        pasteTab.classList.add('hidden');
        uploadTabBtn.classList.add('border-blue-500', 'text-blue-600');
        uploadTabBtn.classList.remove('border-gray-300', 'text-gray-600');
        pasteTabBtn.classList.remove('border-blue-500', 'text-blue-600');
        pasteTabBtn.classList.add('border-gray-300', 'text-gray-600');
    });

    // File upload handling
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const ocrStatus = document.getElementById('ocr-status');
        const extractionResult = document.getElementById('extraction-result');
        const extractedTextArea = document.getElementById('extracted-text');

        ocrStatus.classList.remove('hidden');
        extractionResult.classList.add('hidden');

        try {
            let text = '';

            if (file.type === 'application/pdf') {
                text = await extractTextFromPDF(file);
            } else {
                text = await extractTextFromImage(file);
            }

            extractedTextArea.value = text;
            ocrStatus.classList.add('hidden');
            extractionResult.classList.remove('hidden');
        } catch (error) {
            ocrStatus.classList.add('hidden');
            alert(`Error processing file: ${error.message}`);
        }
    });
}

async function extractTextFromImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const result = await Tesseract.recognize(e.target.result, 'eng');
                resolve(result.data.text);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

async function extractTextFromPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const pdf = await pdfjsLib.getDocument(e.target.result).promise;
                let fullText = '';

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }

                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read PDF'));
        reader.readAsArrayBuffer(file);
    });
}

function parseNames(text, format) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const students = [];

    for (const line of lines) {
        let firstName = '', lastName = '';

        if (format === 'one-per-line' || format === 'comma-separated') {
            // First Last format
            const parts = line.split(/[\s,]+/).filter(p => p.length > 0);
            if (parts.length >= 2) {
                firstName = parts[0];
                lastName = parts.slice(1).join(' ');
            } else if (parts.length === 1) {
                firstName = parts[0];
            }
        } else if (format === 'one-per-line-reversed' || format === 'comma-separated-reversed') {
            // Last, First format
            const parts = line.split(',').map(p => p.trim());
            if (parts.length >= 2) {
                lastName = parts[0];
                firstName = parts[1].split(/\s+/)[0];
            } else {
                const nameParts = line.split(/\s+/);
                if (nameParts.length >= 2) {
                    lastName = nameParts[0];
                    firstName = nameParts.slice(1).join(' ');
                }
            }
        }

        if (firstName && lastName) {
            students.push({ firstName, lastName });
        }
    }

    return students;
}

async function openNameMappingModal(extractedText, format) {
    const students = parseNames(extractedText, format);

    if (students.length === 0) {
        alert('No names could be parsed. Please check the format and try again.');
        return;
    }

    const previewHtml = `
        <div class="space-y-4">
            <p class="text-sm text-gray-600">Found <strong>${students.length}</strong> students. Review and edit below before importing:</p>
            <div class="overflow-x-auto max-h-96 border border-gray-300 rounded-md">
                <table class="w-full text-sm">
                    <thead class="bg-gray-100 sticky top-0">
                        <tr>
                            <th class="px-3 py-2 text-left font-semibold">First Name</th>
                            <th class="px-3 py-2 text-left font-semibold">Last Name</th>
                            <th class="px-3 py-2 text-center font-semibold w-8">Edit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map((s, i) => `
                            <tr class="border-t hover:bg-gray-50 student-preview-row" data-index="${i}">
                                <td class="px-3 py-2"><input type="text" class="first-name-input w-full px-2 py-1 border border-gray-300 rounded" value="${s.firstName}"></td>
                                <td class="px-3 py-2"><input type="text" class="last-name-input w-full px-2 py-1 border border-gray-300 rounded" value="${s.lastName}"></td>
                                <td class="px-3 py-2 text-center"><button class="delete-row-btn text-red-600 hover:text-red-800 font-bold">×</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    showModal({
        title: 'Review & Edit Students',
        content: previewHtml,
        modalWidth: 'max-w-3xl',
        confirmText: 'Import Students',
        confirmClasses: 'bg-green-600 hover:bg-green-700',
        onConfirm: () => {
            const rows = document.querySelectorAll('.student-preview-row');
            const finalStudents = [];

            rows.forEach(row => {
                const firstName = row.querySelector('.first-name-input').value.trim();
                const lastName = row.querySelector('.last-name-input').value.trim();
                if (firstName && lastName) {
                    finalStudents.push({ firstName, lastName });
                }
            });

            if (finalStudents.length > 0) {
                importStudents(finalStudents);
            } else {
                alert('Please keep at least one student.');
            }
        }
    });

    // Delete row functionality
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-row-btn')) {
            e.target.closest('.student-preview-row').remove();
        }
    });
}

function importStudents(students) {
    const classData = getActiveClassData();
    if (!classData) {
        alert('Please select a class first.');
        return;
    }

    if (!classData.students) classData.students = {};

    students.forEach(s => {
        const studentId = `student_${Date.now()}_${Math.random()}`;
        classData.students[studentId] = {
            id: studentId,
            firstName: s.firstName,
            lastName: s.lastName,
            grades: {},
            iep: false,
            midtermGrade: null,
            startingOverallMark: null,
            iepNotes: '',
            generalNotes: '',
            profilePicturePath: null,
            contacts: []
        };
    });

    renderGradebook();
    triggerAutoSave();
    
    showModal({
        title: 'Success!',
        content: `<p>Successfully imported <strong>${students.length}</strong> student(s).</p>`,
        confirmText: 'Close',
        cancelText: null
    });
}
