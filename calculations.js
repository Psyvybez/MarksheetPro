import { getAppState } from './state.js';

export function calculateStudentAverages(student, classData) {
    const units = classData.units || {};
    const catWeights = classData.categoryWeights || { k: 25, t: 25, c: 25, a: 25 };
    
    let totalWeightedTermMark = 0;
    let totalTermWeight = 0;
    
    let catTotals = { k: 0, t: 0, c: 0, a: 0 };
    let catMaxes = { k: 0, t: 0, c: 0, a: 0 };

    // Helper to parse grades: Handles "M" as 0
    const parseGrade = (val) => {
        if (typeof val === 'string' && val.trim().toUpperCase() === 'M') return 0;
        return parseFloat(val);
    };

    Object.values(units).forEach(unit => {
        if (unit.isFinal) return; // Skip final unit for term calc

        const assignments = Object.values(unit.assignments || {});
        let unitWeightedScore = 0;
        let unitTotalWeight = 0;

        assignments.forEach(asg => {
            // SKIP calculation if assignment is marked as "Submitted" (Ungraded)
            if (asg.isSubmitted) return;

            const gradeEntry = student.grades?.[asg.id];
            const weight = parseFloat(asg.weight) || 1;

            ['k', 't', 'c', 'a'].forEach(cat => {
                const scoreRaw = gradeEntry?.[cat];
                const score = parseGrade(scoreRaw);
                const total = parseFloat(asg.categoryTotals?.[cat]) || 0;

                if (!isNaN(score) && total > 0) {
                    const weightedScore = (score / total) * 100 * weight;
                    // Add to Unit Totals
                    unitWeightedScore += weightedScore * (catWeights[cat] / 100);
                    unitTotalWeight += weight * (catWeights[cat] / 100);

                    // Add to Category Totals (for display)
                    catTotals[cat] += score * weight;
                    catMaxes[cat] += total * weight;
                }
            });
        });

        // Add Unit Average to Term Total
        if (unitTotalWeight > 0) {
            const unitAvg = (unitWeightedScore / unitTotalWeight) * 100; // Normalized to 100%
            const unitWeightInTerm = parseFloat(unit.weight) || 0;
            
            totalWeightedTermMark += unitAvg * unitWeightInTerm;
            totalTermWeight += unitWeightInTerm;
        }
    });

    // --- Term Mark Calculation ---
    let termMark = totalTermWeight > 0 ? totalWeightedTermMark / totalTermWeight : null;

    // --- Final Mark Calculation ---
    let finalMark = null;
    const finalUnit = Object.values(units).find(u => u.isFinal);
    
    if (finalUnit) {
        let finalWeightedSum = 0;
        let finalTotalWeight = 0;
        
        Object.values(finalUnit.assignments || {}).forEach(asg => {
            // SKIP if submitted/ungraded
            if (asg.isSubmitted) return;

            const gradeRaw = student.grades?.[asg.id]?.grade;
            const score = parseGrade(gradeRaw);
            const total = parseFloat(asg.total) || 0;
            const weight = parseFloat(asg.weight) || 1;

            if (!isNaN(score) && total > 0) {
                finalWeightedSum += (score / total) * 100 * weight;
                finalTotalWeight += weight;
            }
        });

        if (finalTotalWeight > 0) {
            finalMark = finalWeightedSum / finalTotalWeight;
        }
    }

    // --- Overall Grade Calculation ---
    let overallGrade = null;
    if (termMark !== null && finalMark !== null) {
        // (Term % * TermWeight) + (Final % * FinalWeight)
        // Adjust weights based on data.finalWeight
        const finalWeightPct = parseFloat(classData.finalWeight) || 30;
        const termWeightPct = 100 - finalWeightPct;
        overallGrade = (termMark * (termWeightPct/100)) + (finalMark * (finalWeightPct/100));
    } else if (termMark !== null) {
        overallGrade = termMark;
    } else if (finalMark !== null) {
        // Rare case: only final exists
        overallGrade = finalMark;
    }

    // --- Category Averages ---
    const categoryAvgs = {};
    ['k', 't', 'c', 'a'].forEach(cat => {
        categoryAvgs[cat] = catMaxes[cat] > 0 ? (catTotals[cat] / catMaxes[cat]) * 100 : null;
    });

    return {
        termMark,
        finalMark,
        overallGrade,
        categories: categoryAvgs
    };
}

export function calculateClassAverages(classData) {
    if (!classData) return {};
    // ... existing logic if needed, or rely on recalculateAndRenderAverages in main loop
    // For simplicity, we usually calculate this on the fly in the render loop or helper
    return {}; 
}

export function recalculateAndRenderAverages() {
    // This function is called after rendering to fill in the footer and student summary columns
    const { getActiveClassData } = require('./state.js'); // Dynamic import to avoid cycles
    const classData = getActiveClassData();
    if (!classData) return;

    const students = Object.values(classData.students || {});
    if (students.length === 0) return;

    let classOverallSum = 0, classOverallCount = 0;
    let classTermSum = 0, classTermCount = 0;
    let classFinalSum = 0, classFinalCount = 0;

    students.forEach(student => {
        const avgs = calculateStudentAverages(student, classData);
        
        // Update Student Row DOM
        const row = document.querySelector(`tr[data-student-id="${student.id}"]`);
        if (row) {
            const fmt = (v) => v !== null ? `${v.toFixed(1)}%` : '--%';
            
            // Color coding helper
            const colorize = (el, val) => {
                el.classList.remove('bg-green-100', 'text-green-800', 'bg-yellow-100', 'text-yellow-800', 'bg-red-100', 'text-red-800', 'font-bold');
                if (val !== null) {
                    el.classList.add('font-bold');
                    if (val >= 80) el.classList.add('bg-green-100', 'text-green-800');
                    else if (val >= 70) el.classList.add('bg-yellow-100', 'text-yellow-800'); // B Level
                    else if (val >= 60) el.classList.add('bg-yellow-100', 'text-yellow-800'); // C Level
                    else if (val < 50) el.classList.add('bg-red-100', 'text-red-800');
                }
            };

            const overallEl = row.querySelector('.student-overall');
            const termEl = row.querySelector('.student-term-mark');
            const finalEl = row.querySelector('.student-final');
            
            if(overallEl) { overallEl.textContent = fmt(avgs.overallGrade); colorize(overallEl, avgs.overallGrade); }
            if(termEl) { termEl.textContent = fmt(avgs.termMark); }
            if(finalEl) { finalEl.textContent = fmt(avgs.finalMark); }

            ['k','t','c','a'].forEach(cat => {
                const el = row.querySelector(`.student-cat-${cat}`);
                if(el) {
                    el.textContent = fmt(avgs.categories[cat]);
                    colorize(el, avgs.categories[cat]);
                }
            });
        }

        if (avgs.overallGrade !== null) { classOverallSum += avgs.overallGrade; classOverallCount++; }
        if (avgs.termMark !== null) { classTermSum += avgs.termMark; classTermCount++; }
        if (avgs.finalMark !== null) { classFinalSum += avgs.finalMark; classFinalCount++; }
    });

    // Update Footer (Class Averages)
    const fmtAvg = (sum, count) => count > 0 ? `${(sum/count).toFixed(1)}%` : '--%';
    
    const footerOverall = document.querySelector('tfoot .class-overall');
    const footerTerm = document.querySelector('tfoot .class-term-mark');
    const footerFinal = document.querySelector('tfoot .class-final');

    if(footerOverall) footerOverall.textContent = fmtAvg(classOverallSum, classOverallCount);
    if(footerTerm) footerTerm.textContent = fmtAvg(classTermSum, classTermCount);
    if(footerFinal) footerFinal.textContent = fmtAvg(classFinalSum, classFinalCount);
}