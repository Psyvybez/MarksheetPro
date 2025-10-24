import { getActiveClassData } from './state.js';

export function calculateStudentAverages(student, classData) {
    if (!student || !classData?.units || !classData.categoryWeights) {
         return { termMark: null, finalMark: null, overallGrade: null, categories: {} };
    }

    let termMark = null, finalMark = null, overallGrade = null;
    const categoryWeights = classData.categoryWeights;
    let termStudentTotals = { k: 0, t: 0, c: 0, a: 0 };
    let termClassTotals = { k: 0, t: 0, c: 0, a: 0 };
    let termCategoriesGradedCount = { k: 0, t: 0, c: 0, a: 0 };

    Object.values(classData.units || {}).filter(u => !u.isFinal).forEach(unit => {
        let unitWeight = unit.weight || 0;

        for (const asg of Object.values(unit.assignments || {})) {
            const weight = asg.weight || 1;

            for (const cat of ['k', 't', 'c', 'a']) {
                const asgMaxCat = asg.categoryTotals?.[cat] || 0;
                const studentGradeCat = student.grades?.[asg.id]?.[cat];

                const isGradeEntered = studentGradeCat !== null && studentGradeCat !== undefined && !isNaN(studentGradeCat) && studentGradeCat !== "";

                if (asgMaxCat > 0) {
                    if (isGradeEntered) {
                        termClassTotals[cat] += asgMaxCat * unitWeight * weight;
                        termStudentTotals[cat] += studentGradeCat * unitWeight * weight;
                        termCategoriesGradedCount[cat]++;
                    }
                }
            }
        }
    });

    let termPercentages = {};
    for (const cat of ['k', 't', 'c', 'a']) {
        if (termClassTotals[cat] > 0 && termCategoriesGradedCount[cat] > 0) {
            termPercentages[cat] = (termStudentTotals[cat] / termClassTotals[cat]) * 100;
        } else {
            termPercentages[cat] = null;
        }
    }

    let termWeightedGrade = 0;
    let termTotalWeightUsed = 0;
    let categoriesWithMarks = 0;

    for (const cat of ['k', 't', 'c', 'a']) {
        if (termPercentages[cat] !== null) {
            const weight = categoryWeights[cat] || 0;
            termWeightedGrade += termPercentages[cat] * weight;
            termTotalWeightUsed += weight;
            categoriesWithMarks++;
        }
    }

    if (categoriesWithMarks > 0 && termTotalWeightUsed > 0) {
         termMark = termWeightedGrade / termTotalWeightUsed;
    } else {
         termMark = null;
    }

    if (classData.hasFinal) {
        let finalStudentTotal = 0, finalMaxTotal = 0;
        let finalGradeEnteredCount = 0;
        const finalUnit = Object.values(classData.units).find(u => u.isFinal);
        if (finalUnit) {
            for (const asg of Object.values(finalUnit.assignments || {})) {
                const weight = asg.weight || 1;
                const asgTotal = asg.total || 0;
                if (asgTotal > 0) {
                    const studentGrade = student.grades?.[asg.id]?.grade;
                    const isGradeEntered = studentGrade !== null && studentGrade !== undefined && !isNaN(studentGrade) && studentGrade !== "";
                    if (isGradeEntered) {
                        finalMaxTotal += asgTotal * weight;
                        finalStudentTotal += studentGrade * weight;
                        finalGradeEnteredCount++;
                    }
                }
            }
        }
        if (finalMaxTotal > 0 && finalGradeEnteredCount > 0) {
             finalMark = (finalStudentTotal / finalMaxTotal) * 100;
        } else {
            finalMark = null;
        }
    }

    if (classData.hasFinal && classData.finalWeight && finalMark !== null && termMark !== null) {
        const finalWeight = (classData.finalWeight || 0) / 100;
        overallGrade = (termMark * (1 - finalWeight)) + (finalMark * finalWeight);
    } else if (classData.hasFinal && classData.finalWeight && finalMark !== null && termMark === null) {
        overallGrade = null;
    } else if (termMark !== null) {
        overallGrade = termMark;
    } else {
        overallGrade = null;
    }

    return { termMark, finalMark, overallGrade, categories: termPercentages };
}

export function calculateClassAverages(classData) {
    const students = Object.values(classData?.students || {});
    if (students.length === 0) return { termMark: null, finalMark: null, overallGrade: null };

    let termSum = 0, termCount = 0;
    let finalSum = 0, finalCount = 0;
    let overallSum = 0, overallCount = 0;

    for (const student of students) {
        const avgs = calculateStudentAverages(student, classData);
        if (avgs.termMark !== null) { termSum += avgs.termMark; termCount++; }
        if (avgs.finalMark !== null) { finalSum += avgs.finalMark; finalCount++; }
        if (avgs.overallGrade !== null) { overallSum += avgs.overallGrade; overallCount++; }
    }

    return {
        termMark: termCount > 0 ? termSum / termCount : null,
        finalMark: finalCount > 0 ? finalSum / finalCount : null,
        overallGrade: overallCount > 0 ? overallSum / overallCount : null,
    };
}

export function recalculateAndRenderAverages() {
    const classData = getActiveClassData();
    if (!classData) return;
    
    Object.values(classData.students || {}).forEach(student => {
        const avgs = calculateStudentAverages(student, classData);
        const studentRow = document.querySelector(`.student-row[data-student-id="${student.id}"]`);
        if (studentRow) {
            studentRow.querySelector('.student-overall').textContent = avgs.overallGrade !== null ? `${avgs.overallGrade.toFixed(1)}%` : '--';
            studentRow.querySelector('.student-term-mark').textContent = avgs.termMark !== null ? `${avgs.termMark.toFixed(1)}%` : '--';
            if (classData.hasFinal) {
                 const finalCell = studentRow.querySelector('.student-final');
                 if(finalCell) finalCell.textContent = avgs.finalMark !== null ? `${avgs.finalMark.toFixed(1)}%` : '--';
            }
            for (const cat of ['k', 't', 'c', 'a']) {
                studentRow.querySelector(`.student-cat-${cat}`).textContent = avgs.categories[cat] !== null ? `${avgs.categories[cat].toFixed(1)}%` : '--';
            }
        }
    });

    const classAverages = calculateClassAverages(classData);
    const tfoot = document.querySelector('#gradebookTable tfoot');
    if (tfoot) {
        tfoot.querySelector('.class-overall').textContent = classAverages.overallGrade !== null ? `${classAverages.overallGrade.toFixed(1)}%` : '--';
        tfoot.querySelector('.class-term-mark').textContent = classAverages.termMark !== null ? `${classAverages.termMark.toFixed(1)}%` : '--';
        if(classData.hasFinal){
            const finalCell = tfoot.querySelector('.class-final');
            if(finalCell) finalCell.textContent = classAverages.finalMark !== null ? `${classAverages.finalMark.toFixed(1)}%` : '--';
        }
    }
}
