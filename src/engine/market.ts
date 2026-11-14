/** Учебный рынок. Все компании и параметры вымышлены. */
export type AssetKind = "stock" | "fund" | "deposit";

export interface Asset {
  id: string;
  name: string;
  note: string;
  kind: AssetKind;
  sector: string;
  /** Ожидаемый годовой рост (непрерывное начисление), уже с учётом скачков. */
  mu: number;
  /** Годовая волатильность диффузионной части. */
  sigma: number;
  /** Среднее число скачков в год (обвалы на плохих новостях). */
  jumpRate: number;
  /** Среднее и разброс логарифма скачка. */
  jumpMean: number;
  jumpStd: number;
}

/** Корреляции: одна отрасль 0,65; акция–акция 0,30; акция–фонд 0,60; депозит ни с чем не связан. */
export function correlationMatrix(assets: Asset[]): number[][] {
  return assets.map((a, i) =>
    assets.map((b, j) => {
      if (i === j) return 1;
      if (a.kind === "deposit" || b.kind === "deposit") return 0;
      if (a.kind === "fund" || b.kind === "fund") return 0.6;
      return a.sector === b.sector ? 0.65 : 0.3;
    }),
  );
}

/** Полная годовая дисперсия бумаги: диффузия + скачки. */
export function totalVariance(asset: Asset): number {
  return asset.sigma ** 2 + asset.jumpRate * (asset.jumpMean ** 2 + asset.jumpStd ** 2);
}

/** Ковариационная матрица. Скачки считаем независимыми между компаниями — они идут в диагональ. */
export function covarianceMatrix(assets: Asset[]): number[][] {
  const corr = correlationMatrix(assets);
  return assets.map((a, i) =>
    assets.map((b, j) => (i === j ? totalVariance(a) : corr[i][j] * a.sigma * b.sigma)),
  );
}

/** Разложение Холецкого: A = L·Lᵀ. Нужно, чтобы из независимых шумов получить коррелированные. */
export function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const lower = matrix.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k++) sum -= lower[i][k] * lower[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error("Матрица корреляций не положительно определена");
        lower[i][j] = Math.sqrt(sum);
      } else {
        lower[i][j] = sum / lower[j][j];
      }
    }
  }
  return lower;
}
