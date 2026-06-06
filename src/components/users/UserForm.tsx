import { useState, memo } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";

export const UserForm = memo(function UserForm() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const [isNewUser, setIsNewUser] = useState(true);
  const [phone, setPhone] = useState("");
  const [tail, setTail] = useState("");
  const [initialAmount, setInitialAmount] = useState("0");
  const [remark, setRemark] = useState("");
  const [cardNo, setCardNo] = useState("");
  const [editingCardNo, setEditingCardNo] = useState(false);
  const [error, setError] = useState("");

  const saveFormCardNo = () => {
    setEditingCardNo(false);
  };

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
            {editingCardNo ? (
              <div className="flex items-center gap-2">
                <input
                  value={cardNo}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setCardNo(digits);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && saveFormCardNo()}
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 text-gray-900 dark:text-gray-100"
                  placeholder="0001"
                  maxLength={4}
                  inputMode="numeric"
                  pattern="\d*"
                  autoFocus
                />
                <button onClick={saveFormCardNo} className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"><Check size={16} /></button>
                <button onClick={() => { setEditingCardNo(false); setCardNo(""); }} className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"><X size={16} /></button>
              </div>
            ) : (
              <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-900 dark:text-gray-100">{cardNo || "未设置"}</span>
                <button onClick={() => setEditingCardNo(true)} className="text-gray-400 hover:text-primary transition-colors p-1"><Pencil size={14} /></button>
              </div>
            )}
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
});
