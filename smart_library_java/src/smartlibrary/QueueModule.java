package smartlibrary;

public final class QueueModule {
    private QueueModule() {
    }

    public static final class QueueNode {
        public int studentId;
        public int bookId;
        public QueueNode next;

        public QueueNode(int studentId, int bookId) {
            this.studentId = studentId;
            this.bookId = bookId;
        }
    }

    public static final class QueueState {
        public QueueNode front;
        public QueueNode rear;
    }

    public static QueueNode peek(QueueState state) {
        return state.front;
    }

    public static void enqueue(QueueState state, int studentId, int bookId) {
        QueueNode newNode = new QueueNode(studentId, bookId);
        if (state.front == null) {
            state.front = newNode;
            state.rear = newNode;
            return;
        }
        state.rear.next = newNode;
        state.rear = newNode;
    }

    public static void dequeue(QueueState state) {
        if (state.front == null) {
            return;
        }
        state.front = state.front.next;
        if (state.front == null) {
            state.rear = null;
        }
    }
}
