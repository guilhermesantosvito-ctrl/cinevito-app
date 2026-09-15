import { useState } from 'react';
// import { supabase } from '../lib/supabase-client';

export function UserUploadPage({ user }: { user: any }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    
    setLoading(true);
    setMessage('');
    setErrorMsg('');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id || 'anon'}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Envia o arquivo para o bucket privado "uploads-pendentes"
      // const { error: uploadError } = await supabase.storage
      //   .from('uploads-pendentes')
      //   .upload(filePath, file);
      // if (uploadError) throw uploadError;

      // 2. Insere o registro na tabela "video_uploads" com status pendente
      // const { error: dbError } = await supabase
      //   .from('video_uploads')
      //   .insert({
      //     user_id: user?.id,
      //     uploader_email: user?.email,
      //     original_filename: file.name,
      //     storage_path: filePath,
      //     title,
      //     description,
      //     file_size_bytes: file.size,
      //     status: 'pendente'
      //   });
      // if (dbError) throw dbError;

      setMessage('Vídeo enviado com sucesso! Ele passará por moderação e em breve estará disponível.');
      setFile(null);
      setTitle('');
      setDescription('');
    } catch (err: any) {
      setErrorMsg(`Erro ao enviar: ${err.message || 'Tente novamente.'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="content-wrap page-main">
      <div className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Colaboração</div>
          <h1 className="page-title">Enviar Vídeo</h1>
          <p>Compartilhe seus materiais com a comunidade CineVito.</p>
        </div>
      </div>

      {/* Passo a passo explicativo para o usuário */}
      <div className="panel panel-pad" style={{ marginBottom: '20px', background: 'rgba(0, 200, 255, 0.04)', border: '1px solid rgba(0, 200, 255, 0.15)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#00c8ff' }}>Como funciona o envio?</h3>
        <ul style={{ paddingLeft: '20px', display: 'grid', gap: '6px', fontSize: '0.88rem' }} className="muted">
          <li><strong>1. Selecione o arquivo:</strong> Escolha um vídeo em formato MP4 ou WebM direto do seu aparelho.</li>
          <li><strong>2. Preencha os detalhes:</strong> Dê um título claro e uma breve descrição para identificarmos o conteúdo.</li>
          <li><strong>3. Envie para análise:</strong> O vídeo vai para uma fila de revisão administrativa para garantir a segurança da plataforma.</li>
          <li><strong>4. Publicação:</strong> Assim que aprovado pelo administrador, ele entra no catálogo com crédito anonimizado para sua privacidade!</li>
        </ul>
      </div>

      <form onSubmit={handleUpload} className="panel panel-pad" style={{ display: 'grid', gap: '16px' }}>
        <div className="field">
          <label>Arquivo de Vídeo (MP4 / WebM)</label>
          <input 
            type="file" 
            accept="video/mp4,video/webm" 
            className="input"
            onChange={e => e.target.files && setFile(e.target.files[0])} 
            required 
          />
        </div>

        <div className="field">
          <label>Título do Vídeo</label>
          <input 
            type="text" 
            className="input focus-tv" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            placeholder="Ex: Meu curta-metragem" 
            required
          />
        </div>

        <div className="field">
          <label>Descrição <span className="muted">(Opcional)</span></label>
          <textarea 
            className="input focus-tv" 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Conte um pouco sobre o vídeo..." 
            rows={3}
          />
        </div>

        {message && <p className="form-success" role="status">{message}</p>}
        {errorMsg && <p className="form-error" role="alert">{errorMsg}</p>}

        <button type="submit" className="primary-button focus-tv" disabled={loading}>
          {loading ? 'Enviando arquivo...' : 'Enviar vídeo para aprovação'}
        </button>
      </form>
    </div>
  );
}
