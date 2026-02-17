import { getAppState, getActiveClassData } from './state.js';

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
            const unitAvg = (unitWeightedScore / unitTotalWeight); // Normalized to 100%
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
    return {}; 
}

export function calculateClassStats(classData) {
    if (!classData || !classData.students) return null;

    const students = Object.values(classData.students);
    if (students.length === 0) return null;

    // 1. Grade Distribution
    const distribution = { 'Level 4 (80-100)': 0, 'Level 3 (70-79)': 0, 'Level 2 (60-69)': 0, 'Level 1 (50-59)': 0, 'R (<50)': 0 };
    
    // 2. Category Averages
    const catSums = { k: 0, t: 0, c: 0, a: 0 };
    const catCounts = { k: 0, t: 0, c: 0, a: 0 };

    // 3. Unit Averages
    const unitSums = {};
    const unitCounts = {};

    students.forEach(student => {
        const avgs = calculateStudentAverages(student, classData);

        // Distribution
        if (avgs.overallGrade !== null) {
            if (avgs.overallGrade >= 80) distribution['Level 4 (80-100)']++;
            else if (avgs.overallGrade >= 70) distribution['Level 3 (70-79)']++;
            else if (avgs.overallGrade >= 60) distribution['Level 2 (60-69)']++;
            else if (avgs.overallGrade >= 50) distribution['Level 1 (50-59)']++;
            else distribution['R (<50)']++;
        }

        // Categories
        ['k', 't', 'c', 'a'].forEach(cat => {
            if (avgs.categories[cat] !== null) {
                catSums[cat] += avgs.categories[cat];
                catCounts[cat]++;
            }
        });

        // Units
        // We need to calculate raw unit averages again for the class stats
        // (Re-using logic from calculateStudentAverages roughly)
        Object.values(classData.units || {}).forEach(unit => {
            if (unit.isFinal) return;
            const assignments = Object.values(unit.assignments || {});
            let uSum = 0;
            let uWeight = 0;
            
            assignments.forEach(asg => {
                if(asg.isSubmitted) return;
                const gradeEntry = student.grades?.[asg.id];
                if (!gradeEntry) return;

                // Simple weighted avg for unit stat approximation
                ['k', 't', 'c', 'a'].forEach(cat => {
                    const score = parseFloat(gradeEntry[cat]);
                    const total = parseFloat(asg.categoryTotals?.[cat]);
                    if(!isNaN(score) && total > 0) {
                        const w = (parseFloat(asg.weight) || 1) * 0.25; // simplified assumption or requires deeper import
                        // Actually, let's just use the unit average calculated per student if we stored it, 
                        // but since we don't, we'll skip complex unit-logic here and stick to Categories/Overall for V1
                        // OR: Just aggregate Unit Totals if we had them.
                    }
                });
            });
            // Simplified: Just use student's grades if calculated. 
            // For robust stats, let's stick to Distribution and Categories first, 
            // and maybe Unit *Assignment* averages?
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

//

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
        
        // Update Student Row DOM
        const row = document.querySelector(`tr[data-student-id="${student.id}"]`);
        if (row) {
            const fmt = (v) => v !== null ? `${v.toFixed(1)}%` : '--%';
            
            // --- UPDATED COLOR LOGIC ---
            const colorize = (el, val) => {
                // 1. Clear all possible color classes first
                el.classList.remove(
                    'font-bold', 
                    'bg-green-100', 'text-green-800', 'bg-green-200', 'text-green-900',
                    'bg-blue-100', 'text-blue-800', 'bg-indigo-100', 'text-indigo-900',
                    'bg-yellow-100', 'text-yellow-800', 'bg-yellow-200', 'text-yellow-900',
                    'bg-orange-100', 'text-orange-800', 'bg-orange-200', 'text-orange-900',
                    'bg-red-100', 'text-red-800', 'bg-red-200', 'text-red-900', 'text-rose-800'
                );

                if (val !== null) {
                    el.classList.add('font-bold');
                    
                    if (val >= 80) {
                        // Level 4: Strong Green
                        el.classList.add('bg-green-200', 'text-green-900'); 
                    } else if (val >= 70) {
                        // Level 3: Distinct Blue (Easier to distinguish from Level 4)
                        el.classList.add('bg-indigo-100', 'text-indigo-900');
                    } else if (val >= 60) {
                        // Level 2: Stronger Yellow
                        el.classList.add('bg-yellow-200', 'text-yellow-900');
                    } else if (val >= 50) {
                        // Level 1: Orange (Was missing previously)
                        el.classList.add('bg-orange-200', 'text-orange-900');
                    } else {
                        // R: Strong Red
                        el.classList.add('bg-red-200', 'text-red-900');
                    }
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