//
import { getAppState, getActiveClassData } from './state.js';

// NEW: Centralized color logic for use in Render and Main
export function getGradeColorClass(value, max = 100) {
    if (value === null || value === undefined || value === '') return '';
    
    const s = String(value).toUpperCase();
    if (s === 'M' || s === '0') return 'missing-cell'; // Handled by CSS
    
    const num = parseFloat(value);
    const maxNum = parseFloat(max);
    
    if (isNaN(num) || isNaN(maxNum) || maxNum === 0) return '';
    
    const pct = (num / maxNum) * 100;
    
    if (pct >= 80) return 'bg-green-200 text-green-900';
    if (pct >= 70) return 'bg-indigo-100 text-indigo-900';
    if (pct >= 60) return 'bg-yellow-200 text-yellow-900';
    if (pct >= 50) return 'bg-orange-200 text-orange-900';
    return 'bg-red-200 text-red-900';
}

export function calculateStudentAverages(student, classData) {
    const units = classData.units || {};
    const catWeights = classData.categoryWeights || { k: 25, t: 25, c: 25, a: 25 };
    
    let totalWeightedTermMark = 0;
    let totalTermWeight = 0;
    
    let catTotals = { k: 0, t: 0, c: 0, a: 0 };
    let catMaxes = { k: 0, t: 0, c: 0, a: 0 };

    const parseGrade = (val) => {
        if (typeof val === 'string' && val.trim().toUpperCase() === 'M') return 0;
        return parseFloat(val);
    };

    Object.values(units).forEach(unit => {
        if (unit.isFinal) return; 

        const assignments = Object.values(unit.assignments || {});
        let unitWeightedScore = 0;
        let unitTotalWeight = 0;

        assignments.forEach(asg => {
            if (asg.isSubmitted) return;

            const gradeEntry = student.grades?.[asg.id];
            const weight = parseFloat(asg.weight) || 1;

            ['k', 't', 'c', 'a'].forEach(cat => {
                const scoreRaw = gradeEntry?.[cat];
                const score = parseGrade(scoreRaw);
                const total = parseFloat(asg.categoryTotals?.[cat]) || 0;

                if (!isNaN(score) && total > 0) {
                    const weightedScore = (score / total) * 100 * weight;
                    unitWeightedScore += weightedScore * (catWeights[cat] / 100);
                    unitTotalWeight += weight * (catWeights[cat] / 100);

                    catTotals[cat] += score * weight;
                    catMaxes[cat] += total * weight;
                }
            });
        });

        if (unitTotalWeight > 0) {
            const unitAvg = (unitWeightedScore / unitTotalWeight); 
            const unitWeightInTerm = parseFloat(unit.weight) || 0;
            
            totalWeightedTermMark += unitAvg * unitWeightInTerm;
            totalTermWeight += unitWeightInTerm;
        }
    });

    let termMark = totalTermWeight > 0 ? totalWeightedTermMark / totalTermWeight : null;

    let finalMark = null;
    const finalUnit = Object.values(units).find(u => u.isFinal);
    
    if (finalUnit) {
        let finalWeightedSum = 0;
        let finalTotalWeight = 0;
        
        Object.values(finalUnit.assignments || {}).forEach(asg => {
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

    let overallGrade = null;
    if (termMark !== null && finalMark !== null) {
        const finalWeightPct = parseFloat(classData.finalWeight) || 30;
        const termWeightPct = 100 - finalWeightPct;
        overallGrade = (termMark * (termWeightPct/100)) + (finalMark * (finalWeightPct/100));
    } else if (termMark !== null) {
        overallGrade = termMark;
    } else if (finalMark !== null) {
        overallGrade = finalMark;
    }

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
    return {}; 
}

export function calculateClassStats(classData) {
    if (!classData || !classData.students) return null;

    const students = Object.values(classData.students);
    if (students.length === 0) return null;

    const distribution = { 'Level 4 (80-100)': 0, 'Level 3 (70-79)': 0, 'Level 2 (60-69)': 0, 'Level 1 (50-59)': 0, 'R (<50)': 0 };
    const catSums = { k: 0, t: 0, c: 0, a: 0 };
    const catCounts = { k: 0, t: 0, c: 0, a: 0 };

    students.forEach(student => {
        const avgs = calculateStudentAverages(student, classData);

        if (avgs.overallGrade !== null) {
            if (avgs.overallGrade >= 80) distribution['Level 4 (80-100)']++;
            else if (avgs.overallGrade >= 70) distribution['Level 3 (70-79)']++;
            else if (avgs.overallGrade >= 60) distribution['Level 2 (60-69)']++;
            else if (avgs.overallGrade >= 50) distribution['Level 1 (50-59)']++;
            else distribution['R (<50)']++;
        }

        ['k', 't', 'c', 'a'].forEach(cat => {
            if (avgs.categories[cat] !== null) {
                catSums[cat] += avgs.categories[cat];
                catCounts[cat]++;
            }
        });
    });

    const catAverages = {
        k: catCounts.k ? (catSums.k / catCounts.k) : 0,
        t: catCounts.t ? (catSums.t / catCounts.t) : 0,
        c: catCounts.c ? (catSums.c / catCounts.c) : 0,
        a: catCounts.a ? (catSums.a / catCounts.a) : 0,
    };

    return { distribution, catAverages };
}

export function recalculateAndRenderAverages() {
    const classData = getActiveClassData();
    if (!classData) return;

    const students = Object.values(classData.students || {});
    if (students.length === 0) return;

    let classOverallSum = 0, classOverallCount = 0;
    let classTermSum = 0, classTermCount = 0;
    let classFinalSum = 0, classFinalCount = 0;

    students.forEach(student => {
        const avgs = calculateStudentAverages(student, classData);
        
        const row = document.querySelector(`tr[data-student-id="${student.id}"]`);
        if (row) {
            const fmt = (v) => v !== null ? `${v.toFixed(1)}%` : '--%';
            
            // USE SHARED HELPER FOR SUMMARY CELLS (Max = 100%)
            const applyColor = (el, val) => {
                // Reset classes
                el.className = el.className.replace(/\b(bg-\S+|text-\S+)\b/g, '').trim();
                // Add base layout classes back if needed, or simply append new ones
                // Since we don't want to wipe 'p-3', 'text-center' etc, we just remove the specific color ones.
                // A safer way is to remove known color classes:
                 el.classList.remove(
                    'bg-green-200', 'text-green-900',
                    'bg-indigo-100', 'text-indigo-900',
                    'bg-yellow-200', 'text-yellow-900',
                    'bg-orange-200', 'text-orange-900',
                    'bg-red-200', 'text-red-900',
                    'font-bold'
                );
                
                if (val !== null) {
                    el.classList.add('font-bold');
                    const colorClass = getGradeColorClass(val, 100);
                    if(colorClass) {
                        const classes = colorClass.split(' ');
                        el.classList.add(...classes);
                    }
                }
            };

            const overallEl = row.querySelector('.student-overall');
            const termEl = row.querySelector('.student-term-mark');
            const finalEl = row.querySelector('.student-final');
            
            if(overallEl) { overallEl.textContent = fmt(avgs.overallGrade); applyColor(overallEl, avgs.overallGrade); }
            if(termEl) { termEl.textContent = fmt(avgs.termMark); }
            if(finalEl) { finalEl.textContent = fmt(avgs.finalMark); }

            ['k','t','c','a'].forEach(cat => {
                const el = row.querySelector(`.student-cat-${cat}`);
                if(el) {
                    el.textContent = fmt(avgs.categories[cat]);
                    applyColor(el, avgs.categories[cat]);
                }
            });
        }

        if (avgs.overallGrade !== null) { classOverallSum += avgs.overallGrade; classOverallCount++; }
        if (avgs.termMark !== null) { classTermSum += avgs.termMark; classTermCount++; }
        if (avgs.finalMark !== null) { classFinalSum += avgs.finalMark; classFinalCount++; }
    });

    const fmtAvg = (sum, count) => count > 0 ? `${(sum/count).toFixed(1)}%` : '--%';
    
    const footerOverall = document.querySelector('tfoot .class-overall');
    const footerTerm = document.querySelector('tfoot .class-term-mark');
    const footerFinal = document.querySelector('tfoot .class-final');

    if(footerOverall) footerOverall.textContent = fmtAvg(classOverallSum, classOverallCount);
    if(footerTerm) footerTerm.textContent = fmtAvg(classTermSum, classTermCount);
    if(footerFinal) footerFinal.textContent = fmtAvg(classFinalSum, classFinalCount);
}