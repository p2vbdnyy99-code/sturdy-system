"""Online 3-class model: P(take-profit first), P(stop-loss first), P(timeout).

Multinomial logistic regression trained by SGD, one example at a time, with
running feature standardization. Small, transparent, and easy to audit; swap
in something heavier only once this baseline is beaten on held-out data.
"""
import math


class RunningScaler:
    """Welford running mean/variance for online standardization."""

    def __init__(self, n_features):
        self.n = 0
        self.mean = [0.0] * n_features
        self.m2 = [0.0] * n_features

    def update(self, x):
        self.n += 1
        for i, v in enumerate(x):
            d = v - self.mean[i]
            self.mean[i] += d / self.n
            self.m2[i] += d * (v - self.mean[i])

    def transform(self, x):
        out = []
        for i, v in enumerate(x):
            var = self.m2[i] / (self.n - 1) if self.n > 1 else 1.0
            out.append((v - self.mean[i]) / math.sqrt(var + 1e-9))
        return out


def softmax(z):
    m = max(z)
    e = [math.exp(v - m) for v in z]
    s = sum(e)
    return [v / s for v in e]


class OnlineSoftmax:
    def __init__(self, n_features, n_classes=3, lr=0.05, l2=1e-4):
        self.n_features = n_features
        self.n_classes = n_classes
        self.lr = lr
        self.l2 = l2
        # weights[k] = [bias, w_1, ..., w_n]
        self.weights = [[0.0] * (n_features + 1) for _ in range(n_classes)]
        self.scaler = RunningScaler(n_features)
        self.seen = 0

    def predict_proba(self, x_raw):
        x = [1.0] + self.scaler.transform(x_raw)
        z = [sum(w * v for w, v in zip(wk, x)) for wk in self.weights]
        return softmax(z)

    def learn(self, x_raw, label):
        """One SGD step on the cross-entropy loss. Returns the pre-update log loss."""
        self.scaler.update(x_raw)
        x = [1.0] + self.scaler.transform(x_raw)
        p = softmax([sum(w * v for w, v in zip(wk, x)) for wk in self.weights])
        loss = -math.log(max(p[label], 1e-12))
        lr = self.lr / math.sqrt(1.0 + self.seen / 500.0)  # decay: noisy steps early, stable later
        for k in range(self.n_classes):
            g = p[k] - (1.0 if k == label else 0.0)
            wk = self.weights[k]
            for i in range(len(x)):
                reg = self.l2 * wk[i] if i > 0 else 0.0
                wk[i] -= lr * (g * x[i] + reg)
        self.seen += 1
        return loss

    def to_dict(self):
        return {
            "n_features": self.n_features, "n_classes": self.n_classes,
            "lr": self.lr, "l2": self.l2, "weights": self.weights, "seen": self.seen,
            "scaler": {"n": self.scaler.n, "mean": self.scaler.mean, "m2": self.scaler.m2},
        }

    @classmethod
    def from_dict(cls, d):
        m = cls(d["n_features"], d["n_classes"], d["lr"], d["l2"])
        m.weights, m.seen = d["weights"], d["seen"]
        m.scaler.n, m.scaler.mean, m.scaler.m2 = d["scaler"]["n"], d["scaler"]["mean"], d["scaler"]["m2"]
        return m
