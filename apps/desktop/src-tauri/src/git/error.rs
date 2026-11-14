use serde::Serialize;
use std::fmt;

/// Error de dominio. Tauri lo serializa como `CODE|mensaje` para que
/// el adaptador TypeScript pueda separar el código del texto.
#[derive(Debug)]
pub enum GitError {
    NotARepo(String),
    Io(String),
    /// Reservado para stage/commit/checkout hasta que esas operaciones existan.
    #[allow(dead_code)]
    NotImplemented(&'static str),
}

impl GitError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotARepo(_) => "NOT_A_REPO",
            Self::Io(_) => "IO_ERROR",
            Self::NotImplemented(_) => "NOT_IMPLEMENTED",
        }
    }

    fn detail(&self) -> String {
        match self {
            Self::NotARepo(path) => format!("No es un repositorio git: {path}"),
            Self::Io(message) => message.clone(),
            Self::NotImplemented(operation) => {
                format!("{operation} no está implementado en esta fase")
            }
        }
    }
}

impl fmt::Display for GitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}|{}", self.code(), self.detail())
    }
}

impl std::error::Error for GitError {}

impl Serialize for GitError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
