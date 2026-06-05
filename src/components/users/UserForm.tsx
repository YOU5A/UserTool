import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";

export function UserForm() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const [isNewUser, setIsNewUser] = useState(true);
  const [phone, setPhone] = useState("");
  const [tail, setTail] = useState("");
  const [initialAmount, setInitialAmount] = useState("0");
  const [remark, setRemark] = useState("");
  const [cardNo, setCardNo] = useState("");
  const [error, setError] = useState("");

  const onClose = () => {
    store.closeModal("addUser");
    setError("");
    setPhone("");
    setTail("");
    setInitialAmount("0");
    setRemark("");
    setCardNo("");
  };

  const handleSubmit = () => {
    setError("");
    if (isNewUser) {
      if (!/^\d{11}$/.test(phone)) { setError("请输入有效的11位手机号"); return; }
      const result = mgr.addNewUser(phone, parseFloat(initialAmount) || 0, remark || undefined, cardNo || undefined);
      if (!result) { setError("该用户已存在或卡号重复"); return; }
    } else {
      if (!/^\d{4}$/.test(tail)) { setError("请输入4位尾号"); return; }
      const result = mgr.addOldUser(tail, parseFloat(initialAmount) || 0, remark || undefined, cardNo || undefined);
      if (!result) { setError("该用户已存在或卡号重复"); return; }
    }
    rerender();
    onClose();
  };

  return (
    <Dialog open={store.modals.addUser} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">添加用户</h2>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
          <button
            onClick={() => setIsNewUser(true)}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${isNewUser ? "border-primary text-primary" : "border-transparent text-gray-500"}`}
          >新用户 (手机号)</button>
          <button
            onClick={() => setIsNewUser(false)}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${!isNewUser ? "border-primary text-primary" : "border-transparent text-gray-500"}`}
          >旧用户 (尾号)</button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {isNewUser ? (
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">手机号</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="13800138000" maxLength={11} />
            </div>
          ) : (
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">尾号 (4位)</label>
              <Input value={tail} onChange={(e) => setTail(e.target.value)} placeholder="8000" maxLength={4} />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">初始余额</label>
            <Input type="number" value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">姓名</label>
            <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="姓名" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
              会员卡号 <span className="text-xs text-gray-400 font-normal">(4位数字)</span>
            </label>
            <Input
              value={cardNo}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                const digits = raw.slice(0, 4);
                // Live pad to 4 digits as user types
                setCardNo(digits.padStart(4, "0"));
              }}
              placeholder="0001"
              maxLength={4}
              inputMode="numeric"
              pattern="\d*"
            />
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleSubmit}>确认添加</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
